import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { echoRecording, recordingLabel } from "../src/recording-preview.js";

function arena() {
  const g = new Game(createRun("RECORDING-READOUT"));
  g.spawnQueue = [{ time: Infinity }];
  return g;
}

test("実際の録画が24コマに届いた時だけ、手持ちの残響を呼べる", () => {
  const g = arena();
  assert.equal(echoRecording(g).available, false);
  assert.equal(recordingLabel(echoRecording(g)), "録画 0.0秒");
  for (let i = 0; i < 23; i++) g.update(1 / 60, { mx: 1 });
  assert.equal(echoRecording(g).available, false);
  g.update(1 / 60, { mx: 1 });
  assert.equal(echoRecording(g).available, true);
  assert.equal(recordingLabel(echoRecording(g)), "録画 0.4秒");
  g.castEcho();
  assert.equal(echoRecording(g).available, false);
});

test("曲がった実際の位置と射撃は、そのまま次の残響の録画に一致する", () => {
  const g = arena();
  for (let i = 0; i < 90; i++)
    g.update(1 / 60, {
      mx: i < 30 ? 1 : 0,
      my: i >= 30 ? -1 : 0,
      fire: true,
      angle: 0.3,
    });
  const r = echoRecording(g);
  g.castEcho();
  const echo = g.echoes[0];
  assert.deepEqual(
    r.points,
    echo.frames.map(({ x, y }) => ({ x, y })),
  );
  assert.deepEqual(r.origin, { x: echo.x, y: echo.y });
  assert.deepEqual(r.end, r.points.at(-1));
  assert.deepEqual(
    r.shots,
    echo.frames.flatMap((f, frame) =>
      f.fire ? [{ x: f.x, y: f.y, angle: f.angle, frame }] : [],
    ),
  );
  assert.equal(r.seconds, echo.frames.length / 60);
});

test("3.6秒の窓を超えると古い位置が落ち、寿命を伸ばしても録画を捏造しない", () => {
  const g = arena();
  g.addUpgrade("duration");
  for (let i = 0; i < 216; i++) g.update(1 / 60, { mx: 1 });
  const first = echoRecording(g);
  assert.equal(first.frameCount, 216);
  assert.equal(recordingLabel(first), "録画 3.6秒");
  g.update(1 / 60, { my: -1 });
  const next = echoRecording(g);
  assert.deepEqual(next.origin, first.points[1]);
  assert.equal(next.seconds, 3.6);
  assert.ok(g.stats.echoDuration > next.seconds);
});

test("二回目の手持ち・戦闘後の灯し直しは表示し、他の場面と不正な座標は表示しない", () => {
  const g = arena();
  g.addUpgrade("double");
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  g.castEcho();
  assert.equal(echoRecording(g).available, true);
  g.mode = "cleared";
  assert.equal(echoRecording(g).available, true);
  g.mode = "camp";
  assert.equal(echoRecording(g).available, false);
  g.history[0].x = NaN;
  assert.equal(echoRecording(g), null);
});

test("録画を読むだけでは戦闘・履歴・乱数を変更せず、表示用の点からも元の履歴を変えない", () => {
  const g = arena();
  for (let i = 0; i < 60; i++)
    g.update(1 / 60, { my: -1, fire: true, angle: -0.8 });
  const before = JSON.stringify(g);
  for (let i = 0; i < 100; i++) {
    const r = echoRecording(g);
    r.origin.x = -100;
    r.shots[0].angle = 100;
  }
  assert.equal(JSON.stringify(g), before);
  const reopened = new Game(structuredClone(g.run));
  assert.equal(echoRecording(reopened).frameCount, 0);
  assert.equal(echoRecording(reopened).available, false);
});
