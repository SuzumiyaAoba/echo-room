import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { updateApparatus } from "../src/apparatus.js";
import { freshProfile, validateProfile } from "../src/save.js";

function encounter(stage, seed = "ENCOUNTER") {
  const run = createRun(seed);
  run.stage = stage;
  const game = new Game(run);
  game.spawnQueue = [];
  return game;
}
function weave(game, node) {
  game.player.x = node.x - 40;
  game.player.y = node.y;
  game.echoes = [{ x: node.x + 40, y: node.y }];
  for (let i = 0; i < 130; i++) updateApparatus(game, 1 / 60);
}

test("どの航路でも地域の装置へ近づけて光糸を重ねられる", () => {
  for (const stage of [1, 4, 9, 12, 17, 20])
    for (let i = 0; i < 40; i++) {
      const game = encounter(stage, `MACHINE-${i}`);
      for (const node of game.apparatus.objects) {
        assert.equal(game.solid(node.x, node.y, 18), false);
        assert.equal(game.solid(node.x - 16, node.y, 5), false);
        assert.equal(game.solid(node.x + 16, node.y, 5), false);
      }
    }
  assert.equal(encounter(0).apparatus, null);
  assert.equal(encounter(7).apparatus, null);
});

test("装置を二つ修復した報酬は一度だけで、保存から復元される", () => {
  for (const stage of [1, 9, 17]) {
    const game = encounter(stage);
    game.mode = "cleared";
    for (const node of game.apparatus.objects) weave(game, node);
    assert.equal(game.run.memory, 3);
    assert.equal(game.run.scrap, 8);
    assert.deepEqual(game.run.repairs, [stage]);
    for (const node of game.apparatus.objects) weave(game, node);
    assert.equal(game.run.memory, 3);
    const profile = freshProfile();
    profile.run = { ...game.run, repairs: [stage, stage, -1, 0, 7, "9"] };
    const restored = new Game(validateProfile(profile).run);
    assert.deepEqual(restored.run.repairs, [stage]);
    assert.ok(restored.apparatus.objects.every((node) => node.lit));
    restored.mode = "cleared";
    updateApparatus(restored, 1);
    assert.equal(restored.run.memory, 3);
  }
});

test("係留灯の道と回避は潮を防ぎ、道の外は被弾する", () => {
  for (const protection of ["none", "lamp", "dash"]) {
    const game = encounter(1);
    const node = game.apparatus.objects[0];
    game.player.x = node.x;
    game.player.y = 160;
    node.lit = protection === "lamp";
    game.player.invulnerable = protection === "dash" ? 0.1 : 0;
    game.apparatus.wave = { age: ((160 - 44) * 3.2) / 220, y: 160, hit: false };
    updateApparatus(game, 1 / 60);
    assert.equal(game.run.hp, protection === "none" ? 92 : 100);
    updateApparatus(game, 1 / 60);
    assert.equal(game.run.hp, protection === "none" ? 92 : 100);
  }
});

test("硝子の芽は修復前に敵弾を散らし、修復後は敵を狙う", () => {
  const game = encounter(9),
    machine = game.apparatus;
  machine.objects[1].timer = 100;
  const node = machine.objects[0];
  node.timer = 0;
  updateApparatus(game, 1 / 60);
  assert.equal(game.bullets.length, 5);
  assert.ok(game.bullets.every((b) => !b.friendly));
  game.bullets = [];
  node.lit = true;
  node.timer = 0;
  game.spawn("shield", node.x + 50, node.y);
  updateApparatus(game, 1 / 60);
  assert.equal(game.bullets.length, 1);
  assert.ok(game.bullets[0].friendly && game.bullets[0].echo);
  assert.ok(Math.abs(game.bullets[0].angle) < 0.001);
});

test("炉の熱は現在の射撃だけで増え、糸と解放で圧力暴発を止める", () => {
  const game = encounter(17),
    machine = game.apparatus;
  machine.heat = 0;
  game.shoot(game.player, 0, true);
  assert.equal(machine.heat, 0);
  game.shoot(game.player, 0, false);
  assert.equal(machine.heat, 0.05);
  machine.heat = 1;
  updateApparatus(game, 1 / 60);
  assert.ok(machine.warning > 0);
  const node = machine.objects[0];
  game.player.x = node.x - 40;
  game.player.y = node.y;
  game.echoes = [{ x: node.x + 40, y: node.y }];
  for (let i = 0; i < 40; i++) updateApparatus(game, 1 / 60);
  assert.equal(machine.warning, 0);
  assert.ok(machine.heat < 0.72);
  machine.heat = 1;
  machine.warning = 0.4;
  game.echoes = [{ x: node.x, y: node.y }];
  game.release();
  updateApparatus(game, 1 / 60);
  assert.ok(machine.heat < 0.6);
  assert.equal(machine.warning, 0);
});

test("放熱しなければ予告後に圧力が暴発し、熱が下がる", () => {
  const game = encounter(17);
  game.apparatus.heat = 1;
  for (let i = 0; i < 85; i++) updateApparatus(game, 1 / 60);
  assert.equal(game.bullets.filter((b) => !b.friendly).length, 16);
  assert.ok(game.apparatus.heat < 0.3);
});

test("ボスは攻撃を予告し、狙いを固定してから撃ち、攻撃後に隙を作る", () => {
  for (const [stage, kind] of [
    [7, "ferryman"],
    [15, "gardener"],
    [23, "heart"],
  ]) {
    const game = encounter(stage);
    const boss = game.spawn(kind, 240, 100);
    boss.timer = 0;
    game.updateEnemy(boss, 1 / 60);
    assert.equal(boss.state, "windup");
    assert.equal(game.bullets.length, 0);
    assert.ok(boss.plan.name);
    const angle = boss.angle,
      plan = structuredClone(boss.plan);
    game.player.x = 400;
    game.updateEnemy(boss, 0.2);
    assert.equal(boss.angle, angle);
    assert.deepEqual(boss.plan, plan);
    boss.timer = 0;
    game.updateEnemy(boss, 1 / 60);
    assert.equal(boss.state, "recover");
    const shots = game.bullets.length;
    game.updateEnemy(boss, 0.4);
    assert.equal(game.bullets.length, shots);
    assert.equal(boss.state, "recover");
  }
});

test("渡し守の突進は狙いを固定し、第二楽章への移行で予告を短縮しない", () => {
  const game = encounter(7),
    boss = game.spawn("ferryman", 240, 100);
  boss.attack = 2;
  boss.timer = 0;
  game.updateEnemy(boss, 1 / 60);
  assert.equal(boss.plan.kind, "charge");
  boss.hp = boss.maxHp * 0.4;
  game.updateEnemy(boss, 0.1);
  assert.ok(boss.timer >= 0.89);
  const angle = boss.angle;
  game.player.x = 400;
  boss.timer = 0;
  game.updateEnemy(boss, 1 / 60);
  assert.equal(boss.state, "charge");
  assert.equal(boss.angle, angle);
  const oldY = boss.y;
  game.updateEnemy(boss, 0.1);
  assert.ok(boss.y > oldY);
});

test("庭のボスの芽は光糸と解放で摘め、危険な芽を残した場合は被弾する", () => {
  for (const method of ["thread", "burst", "none"]) {
    const game = encounter(15);
    const h = {
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
    game.hazards = [h];
    game.player.x = method === "thread" ? 190 : 240;
    game.player.y = 160;
    if (method === "thread") game.echoes = [{ x: 290, y: 160 }];
    if (method === "burst") {
      game.echoes = [{ x: 240, y: 160 }];
      game.release();
    }
    for (let i = 0; i < 90; i++) game.updateHazards(1 / 60);
    assert.equal(
      game.hazards.filter((h) => h.weavable).length,
      method === "none" ? 1 : 0,
    );
    assert.equal(game.run.hp, method === "none" ? 86 : 100);
  }
});

test("最終ボスの縦断層は横距離で被弾を判定する", () => {
  for (const x of [240, 300]) {
    const game = encounter(23);
    game.player.x = x;
    game.player.y = 235;
    game.hazards = [
      {
        kind: "line",
        axis: "v",
        x: 240,
        y: 80,
        r: 7,
        age: 1.2,
        duration: 1.55,
        damage: 18,
      },
    ];
    game.updateHazards(0.01);
    assert.equal(game.run.hp, x === 240 ? 82 : 100);
  }
});

test("最後の敵を倒した後に潮で倒れても報酬へ進まない", () => {
  const game = encounter(1);
  game.clearTimer = 0.79;
  game.run.hp = 1;
  game.player.x = 240;
  game.player.y = 160;
  game.apparatus.wave = { age: ((160 - 44) * 3.2) / 220, y: 160, hit: false };
  game.update(1 / 60);
  assert.equal(game.mode, "dead");
});
