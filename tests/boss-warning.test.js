import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { areaWarning, chargePath, shotWarning } from "../src/boss-warning.js";

function room(stage) {
  const run = createRun("BOSS-WARNING");
  run.stage = stage;
  const game = new Game(run);
  game.spawnQueue = [];
  return game;
}

function prepareCharge(
  game,
  position = { x: 180, y: 100 },
  target = { x: 400, y: 100 },
) {
  Object.assign(game.player, target);
  const boss = game.spawn("ferryman", position.x, position.y);
  boss.attack = 2;
  boss.timer = 0;
  game.updateEnemy(boss, 1 / 60);
  assert.equal(boss.plan.kind, "charge");
  return boss;
}

test("芽の円は発動の1.25秒で完成し、0.35秒の余韻を充填に含めない", () => {
  const hazard = { kind: "bloom", age: 0.625, duration: 1.6, charge: 0 };
  assert.equal(areaWarning(hazard).progress, 0.5);
  hazard.age = 1.25;
  assert.equal(areaWarning(hazard).progress, 1);
  assert.equal(areaWarning(hazard).active, false);
  hazard.age += 1 / 60;
  assert.equal(areaWarning(hazard).active, true);
  hazard.age = 1.6;
  assert.equal(areaWarning(hazard).afterimage, 1);
});

test("芽と断層の表示は実際の発動フレームと一度だけの被弾に一致する", () => {
  for (const kind of ["bloom", "line"]) {
    const game = room(kind === "bloom" ? 15 : 23);
    Object.assign(game.player, { x: 240, y: 160 });
    const hazard = {
      kind,
      axis: "h",
      x: 240,
      y: 160,
      r: 20,
      age: 0,
      duration: kind === "bloom" ? 1.6 : 1.55,
      damage: 14,
    };
    game.hazards = [hazard];
    let previous = areaWarning(hazard);
    while (!hazard.triggered) {
      game.updateHazards(1 / 60);
      const current = areaWarning(hazard);
      assert.equal(current.active, !!hazard.triggered);
      if (hazard.triggered) {
        assert.equal(current.progress, 1);
        assert.ok(previous.progress < 1);
        assert.ok(previous.progress > 0.98);
      }
      previous = current;
    }
    assert.equal(game.run.hp, 86);
    for (let i = 0; i < 20; i++) game.updateHazards(1 / 60);
    assert.equal(game.run.hp, 86);
  }
});

test("摘む進捗と発動の時計を分け、実際の光糸が半秒で芽を消す", () => {
  const game = room(15),
    hazard = {
      kind: "bloom",
      x: 240,
      y: 160,
      r: 20,
      age: 0,
      duration: 1.6,
      damage: 14,
      weavable: true,
      charge: 0,
    };
  game.hazards = [hazard];
  Object.assign(game.player, { x: 190, y: 160 });
  game.echoes = [{ x: 290, y: 160 }];
  for (let i = 0; i < 15; i++) game.updateHazards(1 / 60);
  assert.ok(Math.abs(areaWarning(hazard).weaveProgress - 0.5) < 1e-12);
  assert.ok(Math.abs(areaWarning(hazard).progress - 0.2) < 1e-12);
  for (let i = 0; i < 16; i++) game.updateHazards(1 / 60);
  assert.equal(hazard.cancelled, true);
  assert.equal(areaWarning(hazard), null);
  assert.equal(game.hazards.length, 0);
  assert.equal(game.run.hp, 100);
});

test("解放で消した芽・味方の余韻・別の攻撃・無効な時計は危険表示を作らない", () => {
  for (const h of [
    null,
    { kind: "pulse", age: 0, duration: 0.4 },
    { kind: "bloom", age: 0, duration: 1.6, cancelled: true },
    { kind: "bloom", age: 0, duration: 1.6, friendly: true },
    { kind: "line", age: NaN, duration: 1.6 },
    { kind: "line", age: 0, duration: 0.2 },
  ])
    assert.equal(areaWarning(h), null);
  const game = room(15),
    hazard = {
      kind: "bloom",
      x: 240,
      y: 160,
      r: 20,
      age: 0.5,
      duration: 1.6,
      damage: 14,
      weavable: true,
      charge: 0,
    };
  game.hazards = [hazard];
  game.echoes = [{ x: 240, y: 160 }];
  game.release();
  assert.equal(areaWarning(hazard), null);
  assert.equal(game.run.hp, 100);
});

test("突進の予告は固定した135の移動と、実際の各フレームの位置に一致する", () => {
  const game = room(7),
    boss = prepareCharge(game),
    before = JSON.stringify(game),
    path = chargePath(game, boss);
  assert.equal(JSON.stringify(game), before);
  assert.equal(path.length, 46);
  assert.ok(Math.abs(path.at(-1).x - path[0].x - 135) < 1e-9);
  boss.timer = 0;
  game.updateEnemy(boss, 1 / 60);
  const actual = [{ x: boss.x, y: boss.y }];
  while (boss.state === "charge") {
    game.updateEnemy(boss, 1 / 60);
    actual.push({ x: boss.x, y: boss.y });
  }
  assert.deepEqual(actual, path);
});

test("壁で止まる軸と滑る軸を保ち、角度の異なる実際の突進へ一致する", () => {
  for (const [position, target] of [
    [
      { x: 400, y: 230 },
      { x: 440, y: 268 },
    ],
    [
      { x: 80, y: 80 },
      { x: 35, y: 35 },
    ],
    [
      { x: 240, y: 230 },
      { x: 240, y: 280 },
    ],
    [
      { x: 400, y: 140 },
      { x: 470, y: 140 },
    ],
  ]) {
    const game = room(7),
      boss = prepareCharge(game, position, target),
      path = chargePath(game, boss),
      before = JSON.stringify(game);
    assert.equal(JSON.stringify(game), before);
    assert.ok(path.length < 46, "The wall ends this charge early");
    boss.timer = 0;
    game.updateEnemy(boss, 1 / 60);
    const actual = [{ x: boss.x, y: boss.y }];
    while (boss.state === "charge") {
      game.updateEnemy(boss, 1 / 60);
      actual.push({ x: boss.x, y: boss.y });
    }
    assert.deepEqual(actual, path);
  }
});

test("狙いの後で主人公と楽章が変わっても、予告は固定した突進を保つ", () => {
  const game = room(7),
    boss = prepareCharge(game),
    path = chargePath(game, boss),
    rng = game.rng.state;
  Object.assign(game.player, { x: 50, y: 250 });
  boss.hp = boss.maxHp * 0.4;
  game.updateEnemy(boss, 0.1);
  assert.equal(boss.phase, 1);
  assert.deepEqual(chargePath(game, boss), path);
  assert.equal(game.rng.state, rng);
  const before = JSON.stringify(game);
  for (let i = 0; i < 20; i++) chargePath(game, boss);
  assert.equal(JSON.stringify(game), before);
  boss.state = "recover";
  assert.equal(chargePath(game, boss), null);
});

test("三ボスの射線は準備した角度だけを読み、読み取りで攻撃や乱数を変えない", () => {
  for (const [stage, kind] of [
    [7, "ferryman"],
    [15, "gardener"],
    [23, "heart"],
  ])
    for (const attack of [0, 1, 2]) {
      const game = room(stage),
        boss = game.spawn(kind, 240, 100);
      boss.attack = attack;
      boss.timer = 0;
      game.updateEnemy(boss, 1 / 60);
      const before = JSON.stringify(game),
        warning = shotWarning(boss);
      if (boss.plan.kind === "charge") assert.equal(warning, null);
      else {
        assert.deepEqual(warning.angles, boss.plan.angles);
        assert.equal(warning.progress, 0);
      }
      assert.equal(JSON.stringify(game), before);
    }
});
