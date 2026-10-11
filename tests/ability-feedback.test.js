import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import {
  echoArrival,
  releasePulse,
  ECHO_ARRIVAL_SECONDS,
} from "../src/ability-feedback.js";

function arena(upgrades = {}) {
  const run = createRun("ABILITY-CLOCK");
  Object.assign(run.upgrades, upgrades);
  const game = new Game(run);
  game.spawnQueue = [{ time: Infinity }];
  for (let i = 0; i < 30; i++) game.update(1 / 60, { mx: 1 });
  return game;
}

test("実際のQの再生時計と現在位置を読み、出現の0.35秒で終える", () => {
  const g = arena();
  g.update(1 / 60, { echo: true });
  assert.equal(g.echoes.length, 1);
  const e = g.echoes[0];
  assert.deepEqual(echoArrival(e), {
    x: e.x,
    y: e.y,
    progress: e.elapsed / ECHO_ARRIVAL_SECONDS,
  });
  g.update(0.1, {});
  assert.deepEqual(echoArrival(e), {
    x: e.x,
    y: e.y,
    progress: e.elapsed / ECHO_ARRIVAL_SECONDS,
  });
  g.update(ECHO_ARRIVAL_SECONDS, {});
  assert.equal(echoArrival(e), null);
});

test("解放は即時に実際の全半径を示し、三段の強化と三体に追従する", () => {
  for (const burst of [0, 1, 3]) {
    const g = arena({ burst, double: 2 });
    g.castEcho();
    g.castEcho();
    g.castEcho();
    g.release();
    const pulses = g.hazards.filter((h) => h.kind === "pulse" && h.friendly);
    assert.equal(pulses.length, 3);
    for (const h of pulses)
      assert.deepEqual(releasePulse(h), {
        x: h.x,
        y: h.y,
        radius: g.stats.burstRadius,
        progress: 0,
      });
    g.update(0.2, {});
    for (const h of pulses) assert.equal(releasePulse(h).progress, 0.5);
    g.update(0.2, {});
    assert.equal(
      g.hazards.some((h) => h.kind === "pulse" && h.friendly),
      false,
    );
    for (const h of pulses) assert.equal(releasePulse(h), null);
  }
});

test("敵の予告・他の味方効果・キャンセルと寿命外を解放の演出にしない", () => {
  const pulse = {
    kind: "pulse",
    friendly: true,
    x: 80,
    y: 160,
    r: 48,
    age: 0.1,
    duration: 0.4,
  };
  for (const change of [
    { friendly: false },
    { kind: "threadGuard" },
    { cancelled: true },
    { age: 0.4 },
    { age: -0.1 },
    { duration: 0 },
    { r: 0 },
    { x: NaN },
    { age: Infinity },
  ])
    assert.equal(releasePulse({ ...pulse, ...change }), null);
  for (const elapsed of [-0.1, 0.35, Infinity, NaN])
    assert.equal(echoArrival({ x: 80, y: 160, elapsed }), null);
});

test("表示を繰り返しても実際の録画・弾・保存・乱数と時計を進めない", () => {
  const g = arena({ burst: 2, double: 1, counter: 1 });
  g.castEcho();
  g.castEcho();
  const e = g.echoes[0];
  g.release();
  const before = JSON.stringify(g),
    rng = g.rng.state;
  const pulse = g.hazards.find((h) => h.kind === "pulse" && h.friendly);
  for (let i = 0; i < 100; i++) {
    echoArrival(e);
    releasePulse(pulse);
  }
  assert.equal(JSON.stringify(g), before);
  assert.equal(g.rng.state, rng);
});

test("新しく部屋から再開した時は古い出現と解放を持ち越さない", () => {
  const g = arena();
  g.castEcho();
  g.release();
  const saved = structuredClone(g.run),
    next = new Game(saved);
  assert.equal(next.echoes.length, 0);
  assert.equal(
    next.hazards.some((h) => releasePulse(h)),
    false,
  );
  assert.deepEqual(saved, g.run);
  assert.equal(Object.hasOwn(saved, "ability"), false);
});
