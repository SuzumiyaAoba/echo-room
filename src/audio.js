import { SCORES, beatSeconds, noteFrequency, scoreNotes } from "./score.js";

export class AudioEngine {
  constructor(settings, context = null) {
    this.settings = settings;
    this.ctx = null;
    this.step = 0;
    this.nextBeat = 0;
    this.last = {};
    this.scene = { track: null, mood: null, echoes: 0 };
    this.voices = new Set();
    this.playbackActive = true;
    this.pendingSuspend = null;
    if (context) this.initialize(context);
  }
  initialize(context) {
    this.ctx = context;
    this.master = context.createGain();
    this.master.gain.value = 0.55;
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 4.5;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.master.connect(this.limiter);
    this.limiter.connect(context.destination);
    this.music = context.createGain();
    this.effects = context.createGain();
    this.music.gain.value = this.settings.music;
    this.effects.gain.value = this.settings.effects;
    this.musicLevel = context.createGain();
    this.musicLevel.gain.value = 0.7;
    this.duck = context.createGain();
    this.music.connect(this.musicLevel);
    this.musicLevel.connect(this.duck);
    this.duck.connect(this.master);
    this.effects.connect(this.master);
    this.delay = context.createDelay(2);
    this.delay.delayTime.value = beatSeconds(SCORES.harbor) * 1.5;
    this.feedback = context.createGain();
    this.feedback.gain.value = 0.2;
    this.delayFilter = context.createBiquadFilter();
    this.delayFilter.type = "lowpass";
    this.delayFilter.frequency.value = 1500;
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delayFilter.connect(this.music);
    this.nextBeat = context.currentTime + 0.1;
  }
  async start() {
    this.playbackActive = true;
    try {
      if (!this.ctx) {
        this.initialize(
          new (window.AudioContext || window.webkitAudioContext)(),
        );
      }
      // Some browsers still report running until suspend() has settled.
      while (this.pendingSuspend) await this.pendingSuspend;
      if (!this.playbackActive) return;
      if (["suspended", "interrupted"].includes(this.ctx.state)) {
        await this.ctx.resume();
        if (!this.playbackActive) await this.suspend();
      }
    } catch {
      /* The game remains playable when Web Audio is unavailable. */
    }
  }
  async suspend() {
    this.playbackActive = false;
    let pending;
    try {
      if (!this.ctx || this.ctx.state === "closed") return;
      pending = this.ctx.suspend().catch(() => {});
      this.pendingSuspend = pending;
      await pending;
    } catch {
      /* A denied suspension must not prevent the next user gesture. */
    } finally {
      if (this.pendingSuspend === pending) this.pendingSuspend = null;
    }
  }
  updateSettings(settings) {
    this.settings = settings;
    if (this.ctx) {
      this.music.gain.setTargetAtTime(
        settings.music,
        this.ctx.currentTime,
        0.08,
      );
      this.effects.gain.setTargetAtTime(
        settings.effects,
        this.ctx.currentTime,
        0.08,
      );
    }
  }
  tone(
    freq,
    duration,
    type = "triangle",
    volume = 0.12,
    when = null,
    target = null,
    slide = null,
    options = {},
  ) {
    if (!this.ctx || volume <= 0) return;
    const now = when ?? this.ctx.currentTime,
      osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide)
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(10, slide),
        now + duration,
      );
    const attack = Math.min(options.attack || 0.005, duration * 0.4);
    const hold = Math.min(options.hold || 0, duration - attack - 0.001);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    if (hold > 0) gain.gain.setValueAtTime(volume, now + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    const nodes = [osc, gain];
    let output = gain;
    if (options.filter) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = options.filter;
      output.connect(filter);
      output = filter;
      nodes.push(filter);
    }
    if (options.pan && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = options.pan;
      output.connect(panner);
      output = panner;
      nodes.push(panner);
    }
    output.connect(target || this.effects);
    const voice = {
      osc,
      gain,
      kind: options.music ? "music" : "effect",
      end: now + duration + 0.03,
    };
    this.voices.add(voice);
    osc.onended = () => {
      for (const node of nodes) node.disconnect();
      this.voices.delete(voice);
    };
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }
  noise(duration, volume = 0.08, when = null) {
    if (!this.ctx || volume <= 0) return;
    const n = Math.ceil(this.ctx.sampleRate * duration),
      buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain(),
      filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1500;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects);
    const voice = {
      kind: "effect",
      end: (when ?? this.ctx.currentTime) + duration,
    };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    source.start(when ?? this.ctx.currentTime);
  }
  sfx(id) {
    if (
      !this.ctx ||
      this.ctx.state !== "running" ||
      this.settings.effects === 0
    )
      return;
    const now = this.ctx.currentTime;
    if (
      now - (this.last[id] ?? -10) <
      ({
        shoot: 0.09,
        coin: 0.055,
        enemyshoot: 0.1,
        kill: 0.07,
        threadguard: 0.12,
        stitch: 0.12,
      }[id] || 0.03)
    )
      return;
    this.last[id] = now;
    this.scheduleEffect(id, now);
  }
  scheduleEffect(id, when) {
    if (!this.ctx || this.settings.effects === 0) return;
    const now = Math.max(when, this.ctx.currentTime);
    const tone = (freq, duration, type, volume, offset = 0, slide = null) =>
      this.tone(freq, duration, type, volume, now + offset, null, slide);
    const noise = (duration, volume) => this.noise(duration, volume, now);
    const recipes = {
      shoot: () => tone(780, 0.06, "square", 0.025, 0, 220),
      scatter: () => {
        noise(0.12, 0.08);
        tone(180, 0.09, "triangle", 0.15, 0, 70);
      },
      prism: () => {
        tone(980, 0.13, "sine", 0.09, 0, 330);
        tone(1470, 0.1, "triangle", 0.025);
      },
      threadguard: () => {
        tone(660, 0.12, "sine", 0.045, 0, 990);
        tone(1320, 0.07, "triangle", 0.018);
      },
      counter: () => {
        tone(880, 0.13, "sine", 0.045, 0, 660);
        tone(1174, 0.09, "triangle", 0.025, 0.025);
      },
      stitch: () => {
        tone(740, 0.09, "sine", 0.035, 0, 988);
        tone(1480, 0.07, "triangle", 0.018, 0.035);
      },
      dash: () => {
        noise(0.14, 0.035);
        tone(320, 0.15, "sine", 0.07, 0, 720);
      },
      bell: () => {
        tone(1174, 0.24, "sine", 0.05);
        tone(2349, 0.16, "sine", 0.02, 0.025);
      },
      echo: () => {
        [440, 523, 659].forEach((f, i) =>
          tone(f, 0.45, "sine", 0.09, i * 0.045, f * 0.8),
        );
      },
      burst: () => {
        noise(0.28, 0.14);
        tone(140, 0.35, "triangle", 0.2, 0, 42);
        tone(880, 0.4, "sine", 0.12);
      },
      hurt: () => {
        noise(0.15, 0.13);
        tone(130, 0.18, "sawtooth", 0.07, 0, 55);
      },
      kill: () => tone(210, 0.09, "triangle", 0.1, 0, 80),
      enemyshoot: () => tone(270, 0.1, "triangle", 0.05, 0, 160),
      warning: () => {
        tone(860, 0.1, "square", 0.035);
        tone(1140, 0.1, "square", 0.035, 0.18);
      },
      impact: () => {
        noise(0.2, 0.06);
        tone(80, 0.15, "triangle", 0.12);
      },
      charge: () => tone(120, 0.3, "sawtooth", 0.045, 0, 250),
      coin: () => tone(1318, 0.1, "sine", 0.035),
      heal: () =>
        [440, 554, 659].forEach((f, i) => tone(f, 0.3, "sine", 0.08, i * 0.08)),
      clear: () =>
        [330, 440, 495, 660].forEach((f, i) =>
          tone(f, 0.6, "triangle", 0.08, i * 0.1),
        ),
      upgrade: () =>
        [495, 660, 990].forEach((f, i) =>
          tone(f, 0.35, "sine", 0.08, i * 0.055),
        ),
      bossdeath: () => {
        noise(0.7, 0.18);
        [110, 220, 330, 440].forEach((f) => tone(f, 1.3, "triangle", 0.08));
      },
      ui: () => tone(660, 0.04, "sine", 0.04),
      unweave: () => {
        tone(620, 0.16, "triangle", 0.05, 0, 1240);
        tone(930, 0.2, "sine", 0.04, 0.06);
      },
      shield: () => tone(1100, 0.3, "sine", 0.1, 0, 600),
      spawn: () => tone(130, 0.15, "sine", 0.025, 0, 210),
    };
    if (["warning", "hurt", "burst", "charge", "impact"].includes(id)) {
      const gain = this.duck.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0.48, now + 0.02);
      gain.linearRampToValueAtTime(1, now + 0.38);
    }
    recipes[id]?.();
  }
  applyScene(scene) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const track = SCORES[scene.track] ? scene.track : "harbor";
    if (track !== this.scene.track) {
      for (const voice of this.voices) {
        if (voice.kind !== "music") continue;
        const gain = voice.gain.gain;
        if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
        else {
          const level = gain.value;
          gain.cancelScheduledValues(now);
          gain.setValueAtTime(level, now);
        }
        gain.setTargetAtTime(0, now, 0.13);
        voice.osc.stop(Math.min(voice.end, now + 0.65));
      }
      this.step = 0;
      this.nextBeat = now + 0.06;
      this.delay.delayTime.setTargetAtTime(
        beatSeconds(SCORES[track]) * 1.5,
        now,
        0.1,
      );
    }
    if (scene.mood !== this.scene.mood) {
      this.musicLevel.gain.setTargetAtTime(
        scene.mood === "pause" ? 0.32 : scene.mood === "rest" ? 0.7 : 1,
        now,
        0.15,
      );
    }
    this.scene = { ...scene, track };
  }
  update(scene) {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.applyScene(scene);
    const now = this.ctx.currentTime;
    // Resume a stalled tab from the next pulse without playing missed beats.
    if (this.nextBeat < now - 0.3) this.nextBeat = now + 0.05;
    while (this.nextBeat < now + 0.15) {
      this.sequence(this.step++, this.nextBeat);
      this.nextBeat += beatSeconds(SCORES[this.scene.track]);
    }
  }
  sequence(step, t) {
    if (this.settings.music === 0) return;
    const voices = {
      pad: { type: "sine", attack: 0.24, hold: 0.45 },
      bass: { type: "triangle", attack: 0.015, hold: 0.08, filter: 480 },
      felt: { type: "triangle", attack: 0.008, filter: 1800 },
      glass: { type: "sine", attack: 0.003 },
      clock: { type: "triangle", attack: 0.004, filter: 2100 },
      echo: { type: "sine", attack: 0.035, filter: 1800 },
      pluck: { type: "triangle", attack: 0.003, filter: 950 },
      kick: { type: "sine", slide: 26 },
      tick: { type: "triangle", filter: 2300 },
      pulse: { type: "triangle", filter: 480 },
    };
    for (const n of scoreNotes(
      this.scene.track,
      step,
      this.scene.mood,
      this.scene.echoes,
    )) {
      const v = voices[n.voice],
        f = noteFrequency(n.midi),
        when = t + n.offset;
      const options = { ...v, pan: n.pan, music: true };
      this.tone(
        f,
        n.duration,
        v.type,
        n.volume,
        when,
        this.music,
        v.slide,
        options,
      );
      if (n.voice === "glass")
        this.tone(
          f * 2,
          n.duration * 0.6,
          "sine",
          n.volume * 0.14,
          when,
          this.music,
          null,
          options,
        );
      if (["felt", "glass", "clock"].includes(n.voice))
        this.tone(
          f,
          n.duration,
          "sine",
          n.volume * 0.16,
          when + 0.025,
          this.delay,
          null,
          options,
        );
    }
  }
}
