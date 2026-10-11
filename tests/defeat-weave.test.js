import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { ENEMIES } from "../src/content.js";
import { DEFEAT_LIMIT, advanceDefeats } from "../src/defeat-weave.js";

function scene() {
  const game = new Game(createRun("DEFEAT-WEAVE"));
  game.spawnQueue = [{ time: Infinity }];
  return game;
}

test("全九種類の敵は実際の致命傷で独立した撃破の姿を残す", () => {
  for (const kind of Object.keys(ENEMIES)) {
    const game = scene(),
      enemy = game.spawn(kind, 150, 160);
    game.damageEnemy(enemy, enemy.hp, "weapon");
    assert.equal(game.enemies.length, 0);
    assert.equal(game.defeats.length, 1);
    const cue = game.defeats[0];
    assert.equal(cue.kind, kind);
    assert.equal(cue.boss, !!ENEMIES[kind].boss);
    assert.equal(cue.scale, cue.boss ? 1.7 : 1);
    assert.equal(cue.duration, cue.boss ? 0.7 : 0.45);
    enemy.x = 999;
    enemy.kind = "moth";
    assert.equal(cue.x, 150);
    assert.equal(cue.kind, kind);
  }
});

test("生きている敵と二度目の致命傷は撃破の姿と報酬を増やさない", () => {
  const game = scene(),
    enemy = game.spawn("crawler", 150, 160);
  game.damageEnemy(enemy, 1, "weapon");
  assert.equal(game.defeats.length, 0);
  game.damageEnemy(enemy, enemy.hp, "echo");
  const before = JSON.stringify(game);
  game.damageEnemy(enemy, 999, "thread");
  assert.equal(JSON.stringify(game), before);
  assert.equal(game.run.kills, 1);
});

test("光糸と残響・解放・射撃の最後の一撃を色へ反映する", () => {
  for (const [source, color] of [
    ["thread", "#a9f0d0"],
    ["echo", "#a9f0d0"],
    ["burst", "#8cf1d7"],
    ["weapon", ENEMIES.crawler.color],
  ]) {
    const game = scene(),
      enemy = game.spawn("crawler", 150, 160, true);
    game.damageEnemy(enemy, enemy.hp, source);
    assert.equal(game.defeats[0].source, source);
    assert.equal(game.defeats[0].color, color);
    assert.equal(game.defeats[0].scale, 1.25);
  }
});

test("通常の時計でだけ進み、普通の敵は0.45秒で消える", () => {
  const game = scene(),
    enemy = game.spawn("crawler", 150, 160);
  game.damageEnemy(enemy, enemy.hp, "weapon");
  const frozen = JSON.stringify(game.defeats);
  for (let i = 0; i < 50; i++)
    assert.equal(JSON.stringify(game.defeats), frozen);
  game.update(0.4);
  assert.equal(game.defeats.length, 1);
  assert.equal(game.defeats[0].age, 0.4);
  game.update(0.06);
  assert.equal(game.defeats.length, 0);
});

test("ボスの撃破は0.7秒で消え、0.8秒の報酬までの間を延ばさない", () => {
  const game = scene(),
    boss = game.spawn("ferryman", 150, 160);
  game.spawnQueue = [];
  game.damageEnemy(boss, boss.hp, "weapon");
  game.update(0.69);
  assert.equal(game.defeats.length, 1);
  game.update(0.02);
  assert.equal(game.defeats.length, 0);
  assert.equal(game.mode, "combat");
  game.update(0.1);
  assert.equal(game.mode, "reward");
});

test("同時に多数を倒しても最新24体だけを保持し、新しいボスを残す", () => {
  const game = scene();
  for (let i = 0; i < 40; i++) {
    const enemy = game.spawn("crawler", 100 + i, 160);
    game.damageEnemy(enemy, enemy.hp, "burst");
  }
  const boss = game.spawn("heart", 240, 120);
  game.damageEnemy(boss, boss.hp, "burst");
  assert.equal(game.defeats.length, DEFEAT_LIMIT);
  assert.equal(game.defeats.at(-1).kind, "heart");
  assert.equal(game.defeats[0].x, 117);
  assert.equal(game.run.kills, 41);
});

test("撃破の時計は航路と乱数を変更せず、新しい部屋へは持ち越さない", () => {
  const game = scene(),
    enemy = game.spawn("crawler", 150, 160);
  game.damageEnemy(enemy, enemy.hp, "weapon");
  const run = JSON.stringify(game.run),
    rng = game.rng.state;
  advanceDefeats(game, 0.2);
  assert.equal(JSON.stringify(game.run), run);
  assert.equal(game.rng.state, rng);
  assert.ok(!run.includes("defeats"));
  const restored = new Game(structuredClone(game.run));
  assert.deepEqual(restored.defeats, []);
});

test("練習の標的と死亡後の敵には撃破の姿を付けない", () => {
  const game = scene(),
    target = game.spawn("crawler", 150, 160);
  target.practiceTarget = true;
  game.damageEnemy(target, target.hp, "weapon");
  assert.deepEqual(game.defeats, []);
  const enemy = game.spawn("moth", 150, 160);
  game.mode = "dead";
  game.damageEnemy(enemy, enemy.hp, "weapon");
  assert.deepEqual(game.defeats, []);
  assert.equal(enemy.hp, enemy.maxHp);
});
