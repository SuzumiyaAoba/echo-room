export async function renderAudio(page, options) {
  return page.evaluate(async (options) => {
    const { AudioEngine } = await import("/src/audio.js");
    const { SCORES, beatSeconds } = await import("/src/score.js");
    const track = options.track || "harbor",
      score = SCORES[track];
    const musicSeconds =
      options.seconds ?? beatSeconds(score) * score.meter * 8;
    const sampleRate = 44100;
    const OfflineContext =
      window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const context = new OfflineContext(
      2,
      Math.ceil((musicSeconds + 4) * sampleRate),
      sampleRate,
    );
    const audio = new AudioEngine(
      options.settings || { music: 1, effects: 1 },
      context,
    );
    audio.applyScene({
      track,
      mood: options.mood || "combat",
      echoes: options.echoes || 0,
    });
    for (
      let step = 0, t = 0.1;
      t < musicSeconds;
      step++, t += beatSeconds(score)
    )
      audio.sequence(step, t);
    for (const event of options.effects || [])
      audio.scheduleEffect(event.id, event.at);
    const scheduled = audio.voices.size;
    const buffer = await context.startRendering();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const left = buffer.getChannelData(0),
      right = buffer.getChannelData(1);
    let peak = 0,
      sum = 0,
      difference = 0,
      clipped = 0,
      invalid = 0;
    for (let i = 0; i < left.length; i++) {
      for (const v of [left[i], right[i]]) {
        if (!Number.isFinite(v)) invalid++;
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        if (Math.abs(v) >= 1) clipped++;
      }
      difference += (left[i] - right[i]) ** 2;
    }
    const result = {
      track,
      mood: options.mood || "combat",
      bpm: score.bpm,
      meter: score.meter / 2,
      musicSeconds,
      peak,
      rms: Math.sqrt(sum / (left.length * 2)),
      stereoRms: Math.sqrt(difference / left.length),
      clipped,
      invalid,
      scheduled,
      voicesAfter: audio.voices.size,
    };
    if (options.wave) {
      const bytes = new Uint8Array(44 + left.length * 4),
        view = new DataView(bytes.buffer);
      const chars = (text, offset) =>
        [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      chars("RIFF", 0);
      view.setUint32(4, bytes.length - 8, true);
      chars("WAVEfmt ", 8);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 2, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 4, true);
      view.setUint16(32, 4, true);
      view.setUint16(34, 16, true);
      chars("data", 36);
      view.setUint32(40, bytes.length - 44, true);
      for (let i = 0; i < left.length; i++)
        for (let channel = 0; channel < 2; channel++)
          view.setInt16(
            44 + (i * 2 + channel) * 2,
            Math.round(
              Math.max(-1, Math.min(1, channel ? right[i] : left[i])) * 32767,
            ),
            true,
          );
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      result.wave = btoa(binary);
    }
    return result;
  }, options);
}
