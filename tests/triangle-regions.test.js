import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { pointInTriangle } from "../src/math.js";

function scene(echoes) {
  const g = new Game(createRun("TRIANGLE-REGIONS"));
  g.enemies = [];
  g.spawnQueue = [];
  g.addUpgrade("double");
  g.addUpgrade("double");
  g.addUpgrade("triangle");
  g.player.x = 100;
  g.player.y = 100;
  g.echoes = echoes;
  return g;
}
test("三体の残響が作るすべての三角領域へ届き、最初の二体以外の内側も攻撃する", () => {
  const g = scene([
    { x: 300, y: 100 },
    { x: 100, y: 240 },
    { x: 400, y: 240 },
  ]);
  const enemy = g.spawn("shooter", 340, 180),
    hp = enemy.hp;
  assert.equal(g.triangles().length, 3);
  g.updateThreads(1 / 60);
  assert.equal(enemy.hp, hp - g.stats.thread * 0.15);
});
test("重なる三角形の内側でも攻撃を重複せず、外側へは届かない", () => {
  const g = scene([
    { x: 400, y: 100 },
    { x: 100, y: 250 },
    { x: 200, y: 140 },
  ]);
  const enemy = g.spawn("shooter", 135, 182),
    outside = g.spawn("shooter", 420, 250),
    hp = enemy.hp,
    outsideHp = outside.hp;
  assert.equal(
    g.triangles().filter(([a, b, c]) => pointInTriangle(enemy, a, b, c)).length,
    2,
  );
  g.updateThreads(1 / 60);
  assert.equal(enemy.hp, hp - g.stats.thread * 0.15);
  assert.equal(outside.hp, outsideHp);
});
test("薄すぎる領域・一直線・同じ位置では面を作らず、織片がない場合も作らない", () => {
  const g = scene([
    { x: 120, y: 100 },
    { x: 100, y: 106 },
  ]);
  assert.equal(g.triangles().length, 0);
  g.echoes = [
    { x: 200, y: 100 },
    { x: 300, y: 100 },
    { x: 100, y: 100 },
  ];
  assert.equal(g.triangles().length, 0);
  g.echoes = [
    { x: 300, y: 100 },
    { x: 100, y: 240 },
  ];
  delete g.run.upgrades.triangle;
  assert.equal(g.triangles().length, 0);
});
