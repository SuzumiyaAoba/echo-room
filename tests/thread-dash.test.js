import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";

function scene() {
  const game = new Game(createRun("DASH-THREAD"));
  game.spawnQueue = [{ time: Infinity }];
  game.enemies = [];
  game.player.x = 100;
  game.player.y = 160;
  return game;
}
function stationaryEcho(x = 300, y = 160) {
  return {
    x,
    y,
    elapsed: 0,
    frame: -1,
    frames: Array.from({ length: 60 }, () => ({ x, y, angle: 0, fire: false })),
  };
}
function target(game, x = 200, y = 160) {
  const enemy = game.spawn("shooter", x, y);
  enemy.state = "windup";
  enemy.timer = 10;
  return enemy;
}

test("直前の糸の命中待ち時間があっても、実際の回避で3倍の一撃が出る", () => {
  const game = scene();
  game.addUpgrade("dashthread");
  game.echoes = [stationaryEcho()];
  const enemy = target(game),
    before = enemy.hp;
  enemy.threadCd = 0.12;
  game.update(1 / 60, { my: -1, dash: true });
  assert.ok(Math.abs(before - enemy.hp - game.stats.thread * 0.22 * 3) < 1e-8);
  assert.equal(enemy.dashThreadHit, game.player.dashSerial);
  const after = enemy.hp;
  for (let i = 0; i < 8; i++) game.updateThreads(1 / 60);
  assert.equal(enemy.hp, after, "同じ回避の間に強い一撃を重ねない");
});

test("別の回避には再び強化が乗り、離れた敵へは届かない", () => {
  const game = scene();
  game.addUpgrade("dashthread");
  game.echoes = [stationaryEcho()];
  const enemy = target(game),
    outside = target(game, 400, 160);
  enemy.hp = 100;
  const outsideHp = outside.hp;
  for (let i = 0; i < 2; i++) {
    game.dash(0, -1);
    game.updateThreads(1 / 60);
  }
  assert.ok(Math.abs(100 - enemy.hp - game.stats.thread * 0.22 * 6) < 1e-8);
  assert.equal(outside.hp, outsideHp);
});

test("回避で糸が掃いた内側へ命中し、点になった糸は周囲を攻撃しない", () => {
  const game = scene();
  game.addUpgrade("dashthread");
  game.player.y = 240;
  game.echoes = [stationaryEcho()];
  game.dash(0, 1);
  game.dashThreadOrigin = { x: 100, y: 70 };
  const enemy = target(game, 200, 155),
    before = enemy.hp;
  game.updateThreads(1 / 60);
  assert.ok(Math.abs(before - enemy.hp - game.stats.thread * 0.22 * 3) < 1e-8);
  game.player.x = game.echoes[0].x = 200;
  game.player.y = game.echoes[0].y = 155;
  game.dashThreadOrigin = { x: 200, y: 155 };
  game.dash(0, -1);
  enemy.threadCd = 0;
  const after = enemy.hp;
  game.updateThreads(1 / 60);
  assert.equal(enemy.hp, after);
});

test("残響同士の糸は現在の回避で払われず、通常の糸威力を保つ", () => {
  const game = scene();
  game.addUpgrade("double");
  game.addUpgrade("triangle");
  game.addUpgrade("dashthread");
  game.player.y = 250;
  game.echoes = [stationaryEcho(100, 100), stationaryEcho(300, 100)];
  const enemy = target(game, 200, 100),
    before = enemy.hp;
  game.dash(0, -1);
  game.updateThreads(1 / 60);
  assert.ok(Math.abs(before - enemy.hp - game.stats.thread * 0.22) < 1e-8);
  assert.equal(enemy.dashThreadHit, undefined);
});

test("接触で倒れたフレームの後続の敵と光糸を止め、帰還後の撃破を増やさない", () => {
  const game = scene();
  game.run.hp = 1;
  game.echoes = [stationaryEcho()];
  const killer = game.spawn("crawler", 100, 160);
  killer.contactCd = 0;
  const enemy = target(game);
  enemy.hp = 1;
  enemy.timer = 0;
  enemy.shotAngles = [0];
  game.update(1 / 60, {});
  assert.equal(game.mode, "dead");
  assert.equal(game.run.kills, 0);
  assert.equal(enemy.hp, 1);
  assert.equal(game.bullets.length, 0);
  game.damageEnemy(enemy, 100, "burst");
  game.updateThreads(1 / 60);
  assert.equal(enemy.hp, 1);
});

test("致命的な敵弾の後にある味方の弾と回復を、そのフレームで処理しない", () => {
  const game = scene();
  game.run.hp = 1;
  const enemy = target(game);
  enemy.hp = 1;
  game.makeBullet(game.player, 0, 2, 0, false, "#fff");
  game.makeBullet({ x: 196, y: 160, r: 1 }, 0, 100, 0, true, "#fff");
  game.pickups.push({ kind: "heal", x: 100, y: 160, amount: 30, age: 0 });
  game.update(1 / 60, {});
  assert.equal(game.mode, "dead");
  assert.equal(game.run.hp, 0);
  assert.equal(game.run.kills, 0);
  assert.equal(enemy.hp, 1);
  assert.equal(game.pickups.length, 1);
});
