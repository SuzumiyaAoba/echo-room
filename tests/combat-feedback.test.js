import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import {
  advanceImpact,
  bossTelegraph,
  healthTrailPercent,
  recordImpact,
} from "../src/combat-feedback.js";

function scene() {
  const g = new Game(createRun("IMPACT-FEEDBACK"));
  g.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 70 }];
  return g;
}

test("被弾方向は押し戻される前の位置を使い、無敵中の攻撃では上書きしない", () => {
  const g = scene(),
    before = { x: g.player.x, y: g.player.y };
  g.hurt(15, { x: before.x + 30, y: before.y + 30 });
  assert.equal(g.run.hp, 85);
  assert.equal(g.run.damageTaken, 15);
  assert.equal(g.hitCue.hpBefore, 100);
  assert.equal(g.hitCue.angle, Math.PI / 4);
  assert.ok(g.player.x < before.x && g.player.y < before.y);
  const cue = g.hitCue;
  g.hurt(90, { x: before.x - 30, y: before.y });
  assert.equal(g.hitCue, cue);
  assert.equal(g.run.hp, 85);
});

test("貝殻で防いだ一撃は体力の残像を減らさず、次の被弾と区別する", () => {
  const g = scene();
  g.addUpgrade("shield");
  g.hurt(15, { x: g.player.x + 30, y: g.player.y });
  assert.equal(g.hitCue.kind, "shield");
  assert.equal(g.player.shield, false);
  assert.equal(g.run.damageTaken, 0);
  assert.equal(healthTrailPercent(g), 100);
  for (let i = 0; i < 37; i++) g.update(1 / 60, {});
  g.hurt(15, { x: g.player.x + 30, y: g.player.y });
  assert.equal(g.hitCue.kind, "hurt");
  assert.equal(g.run.hp, 85);
});

test("失った体力を短く残し、部屋の時計が進んだときだけ消す", () => {
  const g = scene();
  g.hurt(20, { x: g.player.x + 30, y: g.player.y });
  advanceImpact(g, 0.25);
  assert.equal(healthTrailPercent(g), 100);
  const saved = JSON.stringify(g.run),
    rng = g.rng.state;
  for (let i = 0; i < 10; i++) assert.equal(healthTrailPercent(g), 100);
  assert.equal(g.hitCue.age, 0.25);
  assert.equal(JSON.stringify(g.run), saved);
  assert.equal(g.rng.state, rng);
  advanceImpact(g, 0.25);
  assert.equal(healthTrailPercent(g), 90);
  advanceImpact(g, 0.25);
  assert.equal(g.hitCue, null);
  assert.equal(healthTrailPercent(g), 80);
  assert.equal(new Game(structuredClone(g.run)).hitCue, null);
});

test("回復や燠火による蘇生後も体力の残像は現在値を下回らない", () => {
  const g = scene();
  g.hurt(20, { x: 270, y: 235 });
  g.heal(20);
  advanceImpact(g, 0.5);
  assert.equal(healthTrailPercent(g), 100);
  g.run.hp = 10;
  g.run.relic = "ember";
  g.player.invulnerable = 0;
  g.hurt(30, { x: 270, y: 235 });
  assert.equal(g.run.hp, 25);
  assert.equal(g.mode, "combat");
  assert.equal(healthTrailPercent(g), 25);
});

test("位置が重なる攻撃は方向を捏造せず、表示の記録で保存や乱数を変えない", () => {
  const g = scene(),
    saved = JSON.stringify(g.run),
    rng = g.rng.state;
  recordImpact(g, { ...g.player }, g.run.hp);
  assert.equal(g.hitCue.angle, null);
  recordImpact(g, null, g.run.hp);
  assert.equal(g.hitCue.angle, null);
  assert.equal(JSON.stringify(g.run), saved);
  assert.equal(g.rng.state, rng);
});

test("ボスの残り時間は実際の固定した予兆を使い、楽章変更で延長しない", () => {
  const boss = {
    state: "windup",
    plan: { windup: 1.25 },
    timer: 0.62,
    phase: 0,
  };
  assert.deepEqual(bossTelegraph(boss), {
    progress: 1 - 0.62 / 1.25,
    remainingSeconds: 0.7,
  });
  boss.phase = 1;
  assert.equal(bossTelegraph(boss).remainingSeconds, 0.7);
  boss.timer = 2;
  assert.deepEqual(bossTelegraph(boss), { progress: 0, remainingSeconds: 1.3 });
  boss.timer = -0.01;
  assert.deepEqual(bossTelegraph(boss), { progress: 1, remainingSeconds: 0 });
  boss.state = "recover";
  assert.equal(bossTelegraph(boss), null);
  assert.equal(
    bossTelegraph({ state: "windup", plan: { windup: 0 }, timer: 0 }),
    null,
  );
});
