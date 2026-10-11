import test from "node:test";
import assert from "node:assert/strict";
import {
  SCORES,
  beatSeconds,
  noteFrequency,
  scoreNotes,
  scoreScene,
} from "../src/score.js";
import { AudioEngine } from "../src/audio.js";
import { Game, createRun } from "../src/game.js";
import { freshProfile } from "../src/save.js";

test("地域と帰還に固有の八小節があり、単なる移調ではなく拍子と旋律が変わる", () => {
  const phrases = new Set();
  const tempi = new Set();
  for (const s of Object.values(SCORES)) {
    assert.equal(s.chords.length, 8);
    assert.equal(s.melody.length, 8);
    for (const bar of s.melody) assert.equal(bar.length, s.meter);
    phrases.add(JSON.stringify(s.melody));
    tempi.add(beatSeconds(s));
  }
  assert.equal(phrases.size, 4);
  assert.equal(tempi.size, 4);
  assert.equal(SCORES.garden.meter, 6);
  assert.equal(noteFrequency(69), 440);
});

test("一周分の地域・休息・ボス・残響の音符が有効な周波数と長さに収まる", () => {
  for (const track of Object.keys(SCORES)) {
    for (const mood of ["rest", "pause", "combat", "boss"]) {
      for (const echoes of [0, 2]) {
        for (let step = 0; step < SCORES[track].meter * 8 * 4; step++) {
          const notes = scoreNotes(track, step, mood, echoes);
          assert.ok(notes.length <= 12);
          for (const n of notes) {
            assert.ok(Number.isFinite(noteFrequency(n.midi)));
            assert.ok(
              noteFrequency(n.midi) >= 50 && noteFrequency(n.midi) < 1800,
            );
            assert.ok(n.duration > 0 && n.duration < 4);
            assert.ok(n.volume > 0 && n.volume <= 0.13);
            assert.ok(n.pan >= -1 && n.pan <= 1);
            assert.ok(n.offset >= 0 && n.offset < beatSeconds(SCORES[track]));
          }
        }
      }
    }
  }
});

test("戦闘とボスで拍を重ね、残響がいる時にだけ応答する声を加える", () => {
  const total = (mood, echoes, voice) =>
    Array.from(
      { length: 64 },
      (_, step) =>
        scoreNotes("harbor", step, mood, echoes).filter(
          (n) => n.voice === voice,
        ).length,
    ).reduce((a, b) => a + b);
  assert.equal(total("rest", 0, "kick"), 0);
  assert.ok(total("combat", 0, "kick") > 0);
  assert.ok(total("boss", 0, "kick") > total("combat", 0, "kick"));
  assert.equal(total("combat", 0, "pulse"), 0);
  assert.ok(total("boss", 0, "pulse") > 0);
  assert.equal(total("combat", 0, "echo"), 0);
  assert.ok(total("combat", 2, "echo") > 0);
  assert.equal(total("pause", 0, "kick"), 0);
});

test("実際の地域・ボス・停止・休息・練習・朝から音楽の場面を決める", () => {
  const profile = freshProfile();
  for (const [index, track] of ["harbor", "garden", "furnace"].entries()) {
    const run = createRun("MUSIC");
    run.stage = index * 8;
    const g = new Game(run);
    assert.deepEqual(scoreScene(g, false, "play", profile), {
      track,
      mood: "combat",
      echoes: 0,
    });
    g.boss = { hp: 100 };
    g.echoes = [{ x: 100, y: 100 }];
    assert.deepEqual(scoreScene(g, false, "play", profile), {
      track,
      mood: "boss",
      echoes: 1,
    });
    assert.equal(scoreScene(g, true, "pause", profile).mood, "pause");
    g.mode = "cleared";
    assert.equal(scoreScene(g, true, "routes", profile).mood, "rest");
    assert.equal(scoreScene(g, true, "victory", profile).track, "dawn");
    assert.equal(scoreScene(g, true, "defeat", profile).track, "harbor");
    g.practice = {};
    assert.deepEqual(scoreScene(g, false, "play", profile), {
      track: "harbor",
      mood: "rest",
      echoes: 0,
    });
  }
  assert.equal(scoreScene(null, false, "home", profile).track, "harbor");
  profile.victories = 1;
  assert.equal(scoreScene(null, false, "home", profile).track, "dawn");
});

test("Web Audio が使えなくても音楽と効果音の操作がゲームを止めない", async () => {
  const audio = new AudioEngine(freshProfile().settings);
  await audio.start();
  assert.equal(audio.ctx, null);
  audio.update({ track: "garden", mood: "boss", echoes: 2 });
  audio.updateSettings({ music: 0, effects: 0 });
  audio.tone(440, 0.1);
  audio.noise(0.1);
  audio.sfx("warning");
  audio.scheduleEffect("burst", 0);
  assert.equal(audio.voices.size, 0);
});
