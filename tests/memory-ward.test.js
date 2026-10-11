import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { freshProfile, validateProfile } from "../src/save.js";
import { memoryWardReadout } from "../src/memory-ward.js";

function scene() {
  const run = createRun("MEMORY-WARD");
  run.stage = 23;
  const game = new Game(run);
  game.spawnQueue = [];
  game.enemies = [];
  const boss = game.spawn("heart", 240, 156);
  game.player.x = 160;
  game.player.y = 156;
  game.updateEnemy(boss, 1 / 60);
  return { game, boss };
}

function echo(game, x = 320, y = 156) {
  game.history = Array.from({ length: 24 }, () => ({
    x,
    y,
    angle: 0,
    fire: false,
  }));
  game.castEcho();
}

test("光糸を0.65秒保つと盾が三秒ほどけ、敵の接触待ち時間に妨げられない", () => {
  const { game, boss } = scene();
  echo(game);
  boss.threadCd = 0.2;
  for (let i = 0; i < 38; i++) game.update(1 / 60);
  assert.equal(boss.ward, true);
  assert.ok(boss.wardWeave > 0.63);
  assert.equal(memoryWardReadout(boss).state, "weaving");
  game.update(1 / 60);
  assert.equal(boss.ward, false);
  assert.equal(boss.wardOpen, 3);
  assert.equal(boss.wardWeave, 0);
  assert.equal(memoryWardReadout(boss).text, "盾がほどけた · あと3.0秒");
});

test("糸が離れると進捗が減り、重なった残響だけでは盾をほどかない", () => {
  const { game, boss } = scene();
  echo(game);
  for (let i = 0; i < 20; i++) game.update(1 / 60);
  const before = boss.wardWeave;
  game.echoes = [];
  game.update(1 / 60);
  assert.ok(Math.abs(boss.wardWeave - (before - 2 / 60)) < 1e-8);
  for (let i = 0; i < 20; i++) game.update(1 / 60);
  assert.equal(boss.wardWeave, 0);
  echo(game, game.player.x, game.player.y);
  for (let i = 0; i < 45; i++) game.update(1 / 60);
  assert.equal(boss.wardWeave, 0);
  assert.equal(boss.wardOpen, 0);
});

test("三角の海で囲むと、辺に触れていない盾もほどける", () => {
  const { game, boss } = scene();
  game.run.upgrades.double = 2;
  game.run.upgrades.triangle = 1;
  game.player.x = 240;
  game.player.y = 235;
  game.echoes = [
    { x: 135, y: 105 },
    { x: 345, y: 105 },
  ];
  assert.equal(game.triangles().length, 1);
  for (let i = 0; i < 39; i++) game.updateThreads(1 / 60);
  assert.equal(boss.ward, false);
  assert.equal(boss.wardOpen, 3);
});

test("解放が盾に届いた時だけほどけ、複数残響でも時間を重ねて延ばさない", () => {
  for (const within of [true, false]) {
    const { game, boss } = scene();
    const x = boss.x + game.stats.burstRadius + boss.r + (within ? -1 : 1);
    game.echoes = [
      { x, y: boss.y },
      { x, y: boss.y },
    ];
    const hp = boss.hp;
    game.release();
    assert.equal(boss.ward, !within);
    assert.equal(boss.wardOpen, within ? 3 : 0);
    assert.equal(
      game.labels.filter((l) => l.text === "記憶の盾をほどいた").length,
      within ? 1 : 0,
    );
    assert.equal(boss.hp < hp, within);
  }
});

test("盾をほどくと通常弾の実際の減衰が消え、攻撃の予兆は継続する", () => {
  const { game, boss } = scene();
  const shoot = () => {
    const hp = boss.hp;
    game.makeBullet(
      { x: boss.x - boss.r - 5, y: boss.y },
      0,
      10,
      600,
      true,
      "#f3d69a",
    );
    game.updateBullets(1 / 60);
    return hp - boss.hp;
  };
  assert.ok(Math.abs(shoot() - 2) < 1e-8);
  boss.timer = 0;
  game.updateEnemy(boss, 1 / 60);
  const plan = structuredClone(boss.plan),
    timer = boss.timer;
  game.echoes = [{ x: boss.x, y: boss.y }];
  game.release();
  assert.equal(boss.state, "windup");
  assert.deepEqual(boss.plan, plan);
  assert.equal(boss.timer, timer);
  assert.equal(shoot(), 10);
  boss.timer = 0;
  game.updateEnemy(boss, 1 / 60);
  assert.equal(boss.state, "recover");
  assert.ok(game.bullets.some((b) => !b.friendly));
});

test("三秒の隙はゲームの時計だけで終わり、楽章や自然な開閉を保つ", () => {
  const { game, boss } = scene();
  game.echoes = [{ x: boss.x, y: boss.y }];
  game.release();
  boss.hp = boss.maxHp * 0.4;
  for (let i = 0; i < 179; i++) game.updateEnemy(boss, 1 / 60);
  assert.equal(boss.phase, 1);
  assert.equal(boss.ward, false);
  assert.equal(memoryWardReadout(boss).text, "盾がほどけた · あと0.1秒");
  game.updateEnemy(boss, 1 / 60);
  assert.equal(boss.wardOpen, 0);
  assert.equal(boss.ward, true);
  boss.age = 5;
  game.updateEnemy(boss, 0);
  assert.equal(boss.ward, false);
  assert.equal(memoryWardReadout(boss).state, "quiet");
});

test("盾を読むだけでは状態・乱数・保存を進めず、再開時に部屋の盾を作り直す", () => {
  const { game, boss } = scene();
  game.echoes = [{ x: boss.x, y: boss.y }];
  game.release();
  const state = JSON.stringify(game),
    rng = game.rng.state;
  for (let i = 0; i < 100; i++)
    assert.equal(memoryWardReadout(boss).state, "open");
  assert.equal(JSON.stringify(game), state);
  assert.equal(game.rng.state, rng);
  const profile = freshProfile();
  profile.run = structuredClone(game.run);
  const restored = new Game(validateProfile(profile).run);
  for (let i = 0; i < 180 && !restored.boss; i++) restored.update(1 / 60);
  assert.ok(restored.boss);
  assert.equal(restored.boss.wardOpen, 0);
  assert.equal(restored.boss.ward, true);
});

test("倒れた後や盾を持たないボスに解放しても盾の隙を作らない", () => {
  for (const mode of ["dead", "reward"]) {
    const { game, boss } = scene();
    game.mode = mode;
    game.echoes = [{ x: boss.x, y: boss.y }];
    game.release();
    assert.equal(boss.wardOpen, 0);
  }
  const { game } = scene();
  game.enemies = [];
  const boss = game.spawn("gardener", 240, 156);
  game.echoes = [{ x: boss.x, y: boss.y }];
  game.release();
  assert.equal(boss.wardOpen, undefined);
});
