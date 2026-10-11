import test from "node:test";
import assert from "node:assert/strict";
import { ENEMIES } from "../src/content.js";
import { Game, createRun } from "../src/game.js";
import {
  spawnWarning,
  spawnWarnings,
  SPAWN_WARNING_TIME,
} from "../src/spawn-warning.js";

test("出現前0.85秒だけを読み、出現済み・未開始・未知と無効値を描かない", () => {
  const n = { kind: "crawler", x: 70, y: 65, time: 1.1 };
  assert.equal(SPAWN_WARNING_TIME, 0.85);
  for (const roomTime of [0, 0.25, 1.1, 2, NaN, Infinity])
    assert.equal(spawnWarning(n, roomTime), null);
  assert.ok(spawnWarning(n, 0.251));
  assert.ok(spawnWarning(n, 1.0999));
  assert.equal(spawnWarning({ ...n, kind: "unknown" }, 0.5), null);
  for (const field of ["x", "y", "time"])
    for (const value of [NaN, Infinity, -Infinity, undefined, "70"])
      assert.equal(spawnWarning({ ...n, [field]: value }, 0.5), null);
});

test("九種類の輪郭は実際の種類・強敵・ボスの倍率と大きさを使う", () => {
  for (const [kind, enemy] of Object.entries(ENEMIES))
    for (const elite of [false, true]) {
      const w = spawnWarning({ kind, elite, x: 70.4, y: 65.6, time: 1 }, 0.5);
      assert.equal(w.kind, kind);
      assert.equal(w.x, 70);
      assert.equal(w.y, 66);
      assert.equal(w.boss, !!enemy.boss);
      assert.equal(w.elite, elite && !enemy.boss);
      assert.equal(w.scale, enemy.boss ? 1.7 : elite ? 1.25 : 1);
      assert.equal(w.color, enemy.color);
      assert.ok(w.bounds.left < w.x && w.bounds.right > w.x);
      assert.ok(w.bounds.top < w.y && w.bounds.bottom > w.y + 13);
      assert.ok(Object.values(w.bounds).every(Number.isInteger));
    }
});

test("目盛りは残り時間から一方向に満ち、常に一個から四個に収まる", () => {
  let prior = 0;
  for (let tick = 1; tick < 850; tick++) {
    const w = spawnWarning(
      { kind: "moth", x: 110, y: 195, time: 1 },
      0.15 + tick / 1000,
    );
    assert.ok(w.progress > 0 && w.progress < 1);
    assert.ok(w.ticks >= prior && w.ticks >= 1 && w.ticks <= 4);
    prior = w.ticks;
  }
  assert.equal(prior, 4);
});

test("出現予定とゲーム・乱数・保存する旅を読み取りだけで保持する", () => {
  for (const stage of [0, 1, 7, 9, 15, 17, 23]) {
    const run = createRun("RIFT-IMMUTABLE");
    run.stage = stage;
    const g = new Game(run);
    g.roomTime = 0.8;
    const before = JSON.stringify(g);
    const a = spawnWarnings(g),
      b = spawnWarnings(g);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(g), before);
    assert.ok(a.length > 0);
    g.mode = "event";
    assert.deepEqual(spawnWarnings(g), []);
  }
});

test("実際のキューが出現した瞬間は予告を残さず、出現後の敵を重ねない", () => {
  const g = new Game(createRun("RIFT-ARRIVAL"));
  const first = { ...g.spawnQueue[0] };
  while (g.roomTime < first.time - 0.04) g.update(1 / 60, {});
  assert.ok(spawnWarnings(g).some((w) => w.kind === first.kind));
  while (g.roomTime < first.time + 0.001) g.update(1 / 60, {});
  assert.ok(g.enemies.some((e) => e.kind === first.kind));
  assert.equal(g.enemies.length, 1);
  assert.equal(g.enemies[0].kind, first.kind);
  assert.ok(
    !g.spawnQueue.some((n) => n.time === first.time && n.kind === first.kind),
  );
  assert.ok(g.spawnQueue.every((n) => n.time > g.roomTime));
});
