import test from "node:test";
import assert from "node:assert/strict";
import { PracticeGame } from "../src/practice.js";
import { angleTo, distance } from "../src/math.js";

function walk(g, point, controls = {}) {
  for (let frame = 0; frame < 600 && distance(g.player, point) > 5; frame++) {
    const angle = angleTo(g.player, point);
    g.update(1 / 60, { mx: Math.cos(angle), my: Math.sin(angle), ...controls });
  }
  assert.ok(distance(g.player, point) <= 5, "実際の移動で輪へ到着する");
}
function wait(g, frames, controls = {}) {
  for (let frame = 0; frame < frames; frame++) g.update(1 / 60, controls);
}

test("歩く・射撃・回避・記録・光糸・弾消しを本編の操作で完了する", () => {
  const events = [],
    g = new PracticeGame((type, data) => events.push([type, data]));
  walk(g, { x: 90, y: 230 });
  assert.equal(g.practice.step, 1);
  wait(g, 60, { fire: true, autoAim: true });
  assert.equal(g.practice.step, 2);
  g.update(1 / 60, { mx: 1, dash: true });
  walk(g, { x: 300, y: 230 });
  assert.equal(g.practice.step, 3);
  walk(g, { x: 90, y: 160 });
  assert.equal(g.practice.phase, "cross");
  const origin = { ...g.practice.origin };
  // Follow the horizontal hint from the point at which the ring accepted us.
  walk(g, { x: 320, y: origin.y });
  g.update(1 / 60, { echo: true });
  assert.equal(g.practice.phase, "guard");
  assert.equal(g.practice.step, 3, "糸の攻撃だけでは弾をほどく練習を終えない");
  for (let frame = 0; frame < 180 && g.practice.step === 3; frame++)
    g.update(1 / 60);
  assert.equal(g.practice.step, 4);
  assert.ok(g.run.threadCuts >= 1);
  assert.ok(g.history.length > 100);
  assert.equal(g.run.echoesCast, 1);
  assert.ok(g.echoes[0].frames[0].x < 120);
  assert.equal(g.bullets.filter((b) => !b.friendly).length, 6);
  assert.equal(g.practiceReleaseReady, false);
  for (let frame = 0; frame < 180 && !g.practiceReleaseReady; frame++)
    g.update(1 / 60);
  assert.equal(g.practiceReleaseReady, true);
  g.update(1 / 60, { burst: true });
  assert.equal(g.practice.step, 5);
  assert.equal(g.echoes.length, 0);
  assert.equal(g.bullets.length, 0);
  assert.equal(g.enemies.length, 1, "お題の完了で影の体力や消滅を演出しない");
  assert.ok(g.enemies[0].hp > 0 && g.enemies[0].hp < 120);
  assert.equal(g.run.hp, 100);
  assert.ok(
    events.some(([type, step]) => type === "practice-step" && step === 5),
  );
  assert.ok(
    !events.some(([type]) => ["clear", "death", "exit"].includes(type)),
  );
});

test("移動の代わりに能力を押しても進まず、針と残響の攻撃を区別する", () => {
  const g = new PracticeGame();
  wait(g, 600, { fire: true, echo: true, burst: true });
  assert.equal(g.practice.step, 0);
  assert.equal(g.mode, "combat");
  walk(g, { x: 90, y: 230 });
  wait(g, 60, { angle: Math.PI / 2, fire: true });
  assert.equal(g.practice.step, 1);
  // An echo can hit the target, but the shooting exercise needs a present shot.
  g.shoot(g.player, angleTo(g.player, g.enemies[0]), true);
  wait(g, 60);
  assert.equal(g.practice.step, 1);
  wait(g, 60, { fire: true, autoAim: true });
  assert.equal(g.practice.step, 2);
  walk(g, { x: 300, y: 230 });
  assert.equal(g.practice.step, 2, "歩くだけでは回避の練習を完了しない");
  g.update(1 / 60, { dash: true, mx: -1 });
  assert.equal(g.practice.step, 3);
});

test("失敗した光糸は再練習でき、撃って影を消しても糸のお題を飛ばせない", () => {
  const g = new PracticeGame();
  g.setStep(3);
  g.retry();
  g.update(1 / 60);
  wait(g, 150, { fire: true, autoAim: true });
  assert.equal(g.practice.step, 3);
  assert.ok(g.enemies.length > 0);
  g.update(1 / 60, { echo: true });
  assert.equal(g.practice.step, 3, "同じ場所の残響では影まで糸が届かない");
  g.retry();
  assert.equal(g.player.echoCharges, 1);
  assert.equal(g.player.echoCd, 0);
  assert.equal(g.echoes.length, 0);
  assert.equal(g.history.length, 0);
  g.update(1 / 60);
  walk(g, { x: 320, y: g.practice.origin.y });
  g.update(1 / 60, { echo: true });
  for (let frame = 0; frame < 180 && g.practice.step === 3; frame++)
    g.update(1 / 60);
  assert.equal(g.practice.step, 4);
});

test("残響が消えた後も解放をやり直せ、弾に届かない解放では終わらない", () => {
  const g = new PracticeGame();
  g.setStep(4);
  wait(g, 300);
  assert.match(g.practiceHint, /Qでもう一度/);
  g.update(1 / 60, { echo: true });
  // Leave one bullet outside the burst: the real release must keep it alive.
  const outside = g.bullets.find((b) => !b.friendly);
  outside.x = 60;
  outside.y = 60;
  assert.equal(g.practiceReleaseReady, false);
  g.update(1 / 60, { burst: true });
  assert.equal(g.practice.step, 4);
  assert.equal(g.bullets.filter((b) => !b.friendly && b.life > 0).length, 1);
  assert.ok(g.enemies[0].hp < 120);
  g.retry();
  wait(g, 30);
  g.update(1 / 60, { echo: true });
  g.update(1 / 60, { burst: true });
  assert.equal(g.practice.step, 5);
  assert.equal(g.run.damageTaken, 0);
});
