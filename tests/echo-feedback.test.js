import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { echoLifetime, echoReadout } from "../src/echo-feedback.js";

function arena(upgrades = {}, relic = "spool") {
  const run = createRun("ECHO-CLOCK-CONTRACT", "needle", relic);
  Object.assign(run.upgrades, upgrades);
  const g = new Game(run);
  g.spawnQueue = [{ time: Infinity }];
  g.enemies = [];
  g.bullets = [];
  return g;
}
function advance(g, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60, {});
}

test("軌跡24フレームと実際に呼べる手持ちを読み分ける", () => {
  const g = arena({ double: 2 });
  assert.equal(echoReadout(g).recording, true);
  for (let i = 0; i < 23; i++) g.update(1 / 60, { echo: true });
  assert.equal(g.echoes.length, 0);
  g.update(1 / 60, { echo: true });
  const readout = echoReadout(g);
  assert.equal(readout.recording, false);
  assert.equal(readout.charges, 2);
  assert.equal(readout.capacity, 3);
  assert.equal(g.echoes.length, 1);
  assert.equal(readout.nextSeconds, g.stats.echoCooldown);
});

test("一回分を使える途中でも次の充填を示し、実際の逐次充填に追従する", () => {
  const g = arena({ double: 2, quickecho: 3 });
  advance(g, 0.5);
  g.castEcho();
  g.castEcho();
  advance(g, 1);
  const partial = echoReadout(g);
  assert.equal(partial.charges, 1);
  assert.ok(partial.nextSeconds > 0);
  assert.ok(partial.chargingFraction > 0 && partial.chargingFraction < 1);
  advance(g, g.player.echoCd + 0.02);
  const second = echoReadout(g);
  assert.equal(second.charges, 2);
  assert.ok(second.nextSeconds > 0);
  advance(g, g.player.echoCd + 0.02);
  const full = echoReadout(g);
  assert.equal(full.charges, 3);
  assert.equal(full.nextSeconds, 0);
  assert.equal(full.chargingFraction, 0);
});

test("使い切った手持ちと正の一秒未満をゼロ秒と誤表示しない", () => {
  const g = arena();
  advance(g, 0.5);
  g.castEcho();
  assert.equal(echoReadout(g).charges, 0);
  g.player.echoCd = 0.000001;
  assert.equal(echoReadout(g).nextSeconds, 0.1);
  g.update(1 / 60, {});
  assert.equal(echoReadout(g).charges, 1);
  assert.equal(echoReadout(g).nextSeconds, 0);
  assert.equal(echoLifetime({ elapsed: 5.2 }, 5.8).seconds, 0.6);
  assert.equal(echoLifetime({ elapsed: 3.599999 }, 3.6).seconds, 0.1);
  assert.equal(echoLifetime({ elapsed: 3.6 }, 3.6), null);
});

test("巻糸と寿命の段数は実際の残響が消える時刻に一致する", () => {
  for (const relic of ["spool", "bell", "ember"])
    for (const duration of [0, 1, 3]) {
      const g = arena({ duration }, relic);
      advance(g, 0.5);
      g.castEcho();
      assert.equal(echoReadout(g).shortest.remaining, g.stats.echoDuration);
      g.update(g.stats.echoDuration - 0.01, {});
      assert.equal(g.echoes.length, 1);
      assert.equal(echoReadout(g).shortest.seconds, 0.1);
      assert.equal(echoReadout(g).shortest.urgent, true);
      g.update(0.02, {});
      assert.equal(g.echoes.length, 0);
      assert.equal(echoReadout(g).shortest, null);
    }
});

test("三体の最短を並び順に依存せず示し、自然消滅と解放で対象を更新する", () => {
  const g = arena({ double: 2 });
  advance(g, 0.5);
  g.castEcho();
  advance(g, 0.8);
  g.castEcho();
  advance(g, 0.8);
  g.castEcho();
  const oldest = g.echoes[0];
  g.echoes.reverse();
  assert.equal(
    echoReadout(g).shortest.remaining,
    g.stats.echoDuration - oldest.elapsed,
  );
  g.update(g.stats.echoDuration - oldest.elapsed + 0.01, {});
  assert.equal(g.echoes.length, 2);
  assert.equal(g.echoes.includes(oldest), false);
  assert.ok(echoReadout(g).shortest.remaining > 0.7);
  g.release();
  assert.equal(echoReadout(g).shortest, null);
});

test("生存中の寿命強化と最大数の強化は現在のゲームの仕様を読む", () => {
  const g = arena({}, "bell");
  advance(g, 0.5);
  g.castEcho();
  advance(g, 2);
  const before = echoReadout(g);
  g.addUpgrade("duration");
  g.addUpgrade("double");
  const after = echoReadout(g);
  assert.equal(after.capacity, 2);
  assert.ok(
    Math.abs(after.shortest.remaining - before.shortest.remaining - 1.2) < 1e-9,
  );
});

test("表示を繰り返しても時計・蓄え・録音・保存・乱数を進めない", () => {
  const g = arena({ double: 2, counter: 1 });
  advance(g, 0.5);
  g.castEcho();
  g.echoes[0].returnStock = 3;
  advance(g, 0.5);
  const before = JSON.stringify(g);
  const value = echoReadout(g);
  for (let i = 0; i < 100; i++) assert.deepEqual(echoReadout(g), value);
  assert.equal(JSON.stringify(g), before);
});
