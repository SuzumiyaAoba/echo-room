import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { UPGRADES, catalogUpgrades } from "../src/content.js";
import {
  storedLightCount,
  releaseStoredLights,
} from "../src/counter-thread.js";
import {
  freshProfile,
  validateProfile,
  exportProfile,
  prepareImport,
} from "../src/save.js";
import { rewardPlan } from "../src/rewards.js";
import { traderStock } from "../src/trader.js";
function echo(x = 120, y = 160) {
  return {
    x,
    y,
    r: 5,
    angle: 0,
    elapsed: 0,
    frame: -1,
    returnStock: 0,
    frames: Array.from({ length: 216 }, () => ({
      x,
      y,
      angle: 0,
      fire: false,
      walk: 0,
      moving: false,
    })),
  };
}
function arena(upgrades = { counter: 1 }) {
  const run = createRun("RETURN-LIGHT");
  run.upgrades = { ...upgrades };
  const g = new Game(run);
  g.spawnQueue = [{ time: Infinity }];
  g.enemies = [];
  for (const row of g.tiles)
    for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  g.player.x = 350;
  g.player.y = 160;
  g.echoes = [echo()];
  return g;
}
function catchLight(g, x = 240) {
  const b = g.makeBullet({ x, y: 100 }, Math.PI / 2, 11, 600, false, "#f00");
  g.updateBullets(0.12);
  assert.equal(b.threadGuarded, true);
  return b;
}

test("実際に触れた糸の残響へ三つまで蓄え、余りもほどくが複製しない", () => {
  const g = arena(),
    owner = g.echoes[0],
    state = g.rng.state;
  for (let i = 0; i < 4; i++) catchLight(g);
  assert.equal(g.run.threadCuts, 4);
  assert.equal(owner.returnStock, 3);
  assert.equal(storedLightCount(g), 3);
  assert.equal(g.run.threadReturns, 0);
  assert.equal(g.run.hp, 100);
  assert.equal(g.rng.state, state);
  const plain = arena({});
  catchLight(plain);
  assert.equal(storedLightCount(plain), 0);
  plain.release();
  assert.equal(plain.run.threadReturns, 0);
  assert.ok(!plain.bullets.some((b) => b.returnedLight));
});

test("三角の辺は触れた位置に近い残響へ蓄え、満杯でも別の残響へ流さない", () => {
  const g = arena({ counter: 1, triangle: 1, double: 1 });
  g.player.y = 250;
  g.echoes = [echo(120), echo(320)];
  for (let i = 0; i < 4; i++) catchLight(g, 200);
  assert.deepEqual(
    g.echoes.map((e) => e.returnStock),
    [3, 0],
  );
  catchLight(g, 300);
  assert.deepEqual(
    g.echoes.map((e) => e.returnStock),
    [3, 1],
  );
  assert.equal(g.run.threadCuts, 5);
});

test("解放は残響の位置から蓄えた数の返し針を放ち、通常の衝突で敵へ当てる", () => {
  const g = arena();
  for (let i = 0; i < 3; i++) catchLight(g);
  const owner = g.echoes[0],
    enemy = g.spawn("charger", 240, 160);
  const state = g.rng.state;
  g.release();
  const rays = g.bullets.filter((b) => b.returnedLight);
  assert.equal(rays.length, 3);
  assert.ok(
    rays.every(
      (b) =>
        b.echo &&
        b.friendly &&
        b.damage === 12 &&
        b.origin.x === 120 &&
        b.life === 1.1,
    ),
  );
  assert.equal(owner.returnStock, 0);
  assert.equal(g.run.threadReturns, 3);
  assert.equal(g.echoes.length, 0);
  assert.equal(g.rng.state, state);
  assert.equal(enemy.hp, 58);
  g.updateBullets(0.6);
  assert.equal(enemy.hp, 22);
  assert.equal(g.bullets.length, 0);
  g.release();
  assert.equal(g.run.threadReturns, 3);
  assert.equal(releaseStoredLights(g, owner), 0);
});

test("返し針も壁と残る寿命を守り、遠い敵を無条件に撃たない", () => {
  const wall = arena();
  catchLight(wall);
  const blocked = wall.spawn("charger", 320, 160);
  wall.tiles[9][12] = 2;
  wall.release();
  wall.updateBullets(1);
  assert.equal(blocked.hp, 58);
  assert.equal(wall.bullets.length, 0);
  const far = arena();
  catchLight(far);
  const distant = far.spawn("charger", 410, 160);
  far.release();
  far.updateBullets(2);
  assert.equal(distant.hp, 58);
  assert.equal(far.bullets.length, 0);
});

test("針と残響の強化は返し針にも効き、会心や再吸収を勝手に加えない", () => {
  const g = arena({ counter: 1, damage: 2, echopower: 2, crit: 2 });
  catchLight(g);
  const enemy = g.spawn("charger", 240, 160);
  g.release();
  const ray = g.bullets.find((b) => b.returnedLight);
  assert.ok(Math.abs(ray.damage - 26.88) < 1e-9);
  assert.equal(ray.critical, false);
  assert.equal(ray.prismatic, undefined);
  assert.equal(g.guardBullet(ray), false);
  assert.equal(g.run.threadCuts, 1);
  g.updateBullets(0.6);
  assert.ok(Math.abs(enemy.hp - (58 - 26.88)) < 1e-9);
});

test("残響の寿命と呼び替えで蓄えを失い、解放の弾消しや致命傷の後に蓄えない", () => {
  const replaced = arena();
  catchLight(replaced);
  replaced.history = Array.from({ length: 24 }, () => ({
    x: 300,
    y: 160,
    angle: 0,
    fire: false,
  }));
  replaced.castEcho();
  assert.equal(storedLightCount(replaced), 0);
  assert.equal(replaced.run.threadReturns, 0);
  const expired = arena();
  catchLight(expired);
  for (let i = 0; i < 300; i++) expired.update(1 / 60, {});
  assert.equal(expired.echoes.length, 0);
  assert.equal(expired.run.threadReturns, 0);
  const erased = arena();
  erased.makeBullet({ x: 120, y: 165 }, 0, 11, 0, false, "#f00");
  erased.release();
  assert.equal(erased.run.threadCuts, 0);
  assert.equal(erased.run.threadReturns, 0);
  const dead = arena();
  catchLight(dead);
  const owner = dead.echoes[0];
  dead.mode = "dead";
  assert.equal(releaseStoredLights(dead, owner), 0);
  assert.equal(owner.returnStock, 1);
  assert.equal(dead.run.threadReturns, 0);
});

test("旧候補の支払いと行商を保ち、新しい旅だけ返し縫いに出会う", () => {
  const profile = freshProfile();
  profile.run = createRun("OFFLINE-ROUTE");
  delete profile.run.catalogVersion;
  profile.run.stage = 1;
  profile.run.route = "loom";
  profile.run.checkpoint = "reward";
  profile.run.rewardRoll = 1;
  profile.run.scrap = 10;
  const legacy = prepareImport(exportProfile(profile)).profile.run;
  assert.equal(legacy.catalogVersion, 1);
  assert.equal(legacy.rewardRoll, 1);
  assert.equal(legacy.scrap, 10);
  assert.deepEqual(
    rewardPlan(legacy).offers.map((u) => u.id),
    ["rapid", "quickecho", "pierce"],
  );
  assert.equal(catalogUpgrades(legacy).length, 24);
  assert.equal(new Game(legacy).addUpgrade("counter"), false);
  const oldTrader = createRun("EXPEDITION-REROLL");
  delete oldTrader.catalogVersion;
  oldTrader.stage = 5;
  oldTrader.route = "salvage";
  oldTrader.upgrades = { double: 2, thread: 1, homing: 1 };
  assert.deepEqual(
    traderStock(oldTrader).map((u) => u.id),
    ["triangle", "speed", "dashthread"],
  );
  oldTrader.upgrades.triangle = 1;
  oldTrader.shopBought = ["triangle"];
  assert.deepEqual(
    traderStock(oldTrader).map((u) => u.id),
    ["triangle", "speed", "dashthread"],
  );
  const current = new Game(createRun("CURRENT-CATALOG"));
  assert.equal(catalogUpgrades(current.run).length, UPGRADES.length);
  assert.ok(current.offer(UPGRADES.length).some((u) => u.id === "counter"));
  assert.equal(current.addUpgrade("counter"), true);
  assert.equal(current.addUpgrade("counter"), false);
});

test("新しい織片と返した数を実ファイルで保持し、旧記録と不正な数を正規化する", () => {
  const profile = freshProfile();
  profile.run = createRun("RETURN-BACKUP");
  profile.run.catalogVersion = 2;
  profile.run.upgrades.counter = 1;
  profile.run.threadReturns = 37;
  const restored = prepareImport(exportProfile(profile)).profile.run;
  assert.equal(restored.catalogVersion, 2);
  assert.equal(restored.upgrades.counter, 1);
  assert.equal(restored.threadReturns, 37);
  for (const value of [
    undefined,
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    profile.run.threadReturns = value;
    assert.equal(validateProfile(profile).run.threadReturns, 0);
  }
  delete profile.run.catalogVersion;
  const old = validateProfile(profile).run;
  assert.equal(old.catalogVersion, 1);
  assert.equal(old.upgrades.counter, 0);
  assert.equal(old.threadReturns, 0);
});
