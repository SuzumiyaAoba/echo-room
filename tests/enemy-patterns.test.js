import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { cordProtects, cutCord, lineClear } from "../src/enemy-patterns.js";
import { segmentPairDistance, distance } from "../src/math.js";
import { freshProfile, validateProfile } from "../src/save.js";

function arena() {
  const run = createRun("PATTERNS");
  run.stage = 8;
  const g = new Game(run);
  g.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 65 }];
  for (const row of g.tiles)
    for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  return g;
}
function cord() {
  const g = arena();
  g.player.x = 220;
  g.player.y = 220;
  const a = g.spawn("weaver", 120, 140),
    b = g.spawn("shooter", 320, 140);
  a.timer = 0;
  b.timer = 10;
  g.updateEnemy(a, 1 / 60);
  const h = g.hazards.find((n) => n.kind === "cord");
  assert.ok(h);
  return { g, a, b, h };
}

test("光糸と結びの距離は交差・平行・端点・一点でも正しく判定する", () => {
  const p = (x, y) => ({ x, y });
  const cases = [
    [p(0, 0), p(10, 10), p(0, 10), p(10, 0), 0],
    [p(0, 0), p(10, 0), p(0, 5), p(10, 5), 5],
    [p(0, 0), p(10, 0), p(10, 0), p(10, 10), 0],
    [p(0, 0), p(10, 0), p(4, 0), p(15, 0), 0],
    [p(0, 0), p(3, 0), p(7, 0), p(10, 0), 4],
    [p(2, 3), p(2, 3), p(0, 0), p(10, 0), 3],
    [p(0, 0), p(0, 0), p(3, 4), p(3, 4), 5],
  ];
  for (const [a, b, c, d, want] of cases) {
    assert.equal(segmentPairDistance(a, b, c, d), want);
    assert.equal(segmentPairDistance(d, c, b, a), want);
  }
});

test("射撃役は扇の狙いを固定して予告し、移動した相手を追尾せず撃つ", () => {
  const g = arena(),
    e = g.spawn("shooter", 160, 100);
  g.player.x = 300;
  g.player.y = 100;
  e.timer = 0;
  g.updateEnemy(e, 1 / 60);
  const angles = [...e.shotAngles],
    position = { x: e.x, y: e.y };
  assert.equal(e.state, "windup");
  assert.equal(g.bullets.length, 0);
  g.player.x = 160;
  g.player.y = 220;
  g.updateEnemy(e, 0.6);
  assert.equal(g.bullets.length, 0);
  assert.deepEqual({ x: e.x, y: e.y }, position);
  g.updateEnemy(e, 0.03);
  assert.equal(g.bullets.length, 3);
  assert.deepEqual(
    g.bullets.map((b) => b.angle),
    angles,
  );
  assert.equal(e.state, "move");
});

test("門番は射撃役の前へ移動し、正面の針を防ぎ、後ろの残響を通す", () => {
  const g = arena(),
    guard = g.spawn("shield", 200, 180),
    ally = g.spawn("shooter", 260, 140);
  g.player.x = 260;
  g.player.y = 250;
  const target = { x: 260, y: 170 },
    before = distance(guard, target);
  g.updateEnemy(guard, 0.1);
  assert.equal(guard.protecting, ally.id);
  assert.ok(distance(guard, target) < before);
  const hp = guard.hp;
  g.makeBullet(guard, guard.angle, 20, 0, true, "#fff");
  g.updateBullets(1 / 60);
  assert.equal(guard.hp, hp - 5);
  g.makeBullet(guard, guard.angle + Math.PI, 20, 0, true, "#fff", 0, true);
  g.updateBullets(1 / 60);
  assert.equal(guard.hp, hp - 25);
});

test("赤い結びの予告中は無害で、発動後には線上だけを傷つける", () => {
  const { g, a, b, h } = cord();
  g.player.x = h.x;
  g.player.y = h.y;
  const hp = g.run.hp,
    ax = a.x,
    bx = b.x;
  g.updateHazards(0.8);
  assert.equal(g.run.hp, hp);
  assert.equal(cordProtects(g, b), false);
  g.updateHazards(0.06);
  assert.equal(g.run.hp, hp - 11);
  assert.equal(cordProtects(g, b), true);
  assert.equal(cordProtects(g, a), false);
  g.updateEnemy(a, 0.1);
  g.updateEnemy(b, 0.1);
  assert.equal(a.x, ax);
  assert.equal(b.x, bx);
});

test("交差する光糸で結びを切り、護りと射撃を中断し、一度だけ反撃する", () => {
  const { g, a, b, h } = cord(),
    ahp = a.hp,
    bhp = b.hp;
  g.player.x = h.x;
  g.player.y = h.y - 40;
  g.echoes = [{ x: h.x, y: h.y + 40 }];
  b.state = "windup";
  b.shotAngles = [0, 0.2, -0.2];
  b.timer = 0.05;
  g.updateHazards(0.199);
  assert.equal(g.run.cordCuts, 0);
  g.updateHazards(0.001);
  assert.equal(g.run.cordCuts, 1);
  assert.equal(a.hp, ahp - 16);
  assert.equal(b.hp, bhp - 12);
  assert.equal(cordProtects(g, b), false);
  assert.equal(b.state, "recover");
  g.updateEnemy(b, 0.1);
  assert.equal(g.bullets.length, 0);
  assert.equal(cutCord(g, h), false);
  assert.equal(g.run.cordCuts, 1);
});

test("離れた光糸や長さのない残響では結びを切らない", () => {
  const { g, h } = cord();
  g.player.x = 120;
  g.player.y = 80;
  g.echoes = [{ x: 320, y: 80 }];
  g.updateHazards(0.5);
  assert.equal(h.charge, 0);
  g.echoes = [{ x: 120, y: 80 }];
  g.updateHazards(0.5);
  assert.equal(g.run.cordCuts, 0);
});

test("結びの中間で解放して切れ、撃破は解放として数え、重複して回復しない", () => {
  const { g, a, b, h } = cord(),
    bhp = b.hp;
  a.hp = 14;
  g.addUpgrade("suture");
  g.addUpgrade("refund");
  g.player.echoCd = 5;
  g.run.hp = 50;
  g.echoes = [{ x: h.x, y: h.y }];
  assert.ok(
    distance(a, h) > g.stats.burstRadius &&
      distance(b, h) > g.stats.burstRadius,
  );
  g.release();
  assert.equal(g.run.cordCuts, 1);
  assert.equal(g.run.kills, 1);
  assert.equal(g.run.threadKills, 0);
  assert.equal(g.run.hp, 50);
  assert.equal(g.player.echoCd, 4);
  assert.equal(b.hp, bhp - 12);
  assert.equal(g.echoes.length, 0);
});

test("結ばれた仲間の針への護りは発動中だけで、光糸は護りを通す", () => {
  const { g, b, h } = cord();
  h.age = 0.9;
  const hp = b.hp;
  g.makeBullet(b, 0, 20, 0, true, "#fff");
  g.updateBullets(1 / 60);
  assert.equal(b.hp, hp - 13);
  g.player.x = b.x + 20;
  g.player.y = b.y;
  g.echoes = [{ x: b.x - 20, y: b.y }];
  g.updateThreads(1 / 60);
  assert.ok(Math.abs(b.hp - (hp - 13 - g.stats.thread * 0.22)) < 1e-8);
});

test("仲間の死亡や結びの寿命で護りと危険が消え、無料の切断を数えない", () => {
  const first = cord();
  const hp = first.a.hp;
  first.g.damageEnemy(first.b, first.b.hp, "shot");
  first.g.updateHazards(0.01);
  assert.equal(first.g.hazards.length, 0);
  assert.equal(first.g.run.cordCuts, 0);
  assert.equal(first.a.hp, hp);
  const last = cord();
  last.h.age = last.h.duration - 0.001;
  last.g.player.x = last.h.x;
  last.g.player.y = last.h.y - 40;
  last.g.echoes = [{ x: last.h.x, y: last.h.y + 40 }];
  last.h.charge = 0.199;
  last.g.updateHazards(0.002);
  assert.equal(last.g.hazards.length, 0);
  assert.equal(last.g.run.cordCuts, 0);
});

test("旧旅の連携三体は各部屋で壁を避けて出現し、結びは壁を越えない", () => {
  for (let seed = 0; seed < 30; seed++)
    for (const stage of [9, 12, 14, 17, 20, 22]) {
      const run = createRun(`FORMATION-${seed}`);
      delete run.encounterVersion;
      run.stage = stage;
      const g = new Game(run),
        team = g.spawnQueue.slice(0, 3);
      assert.deepEqual(
        team.map((n) => n.kind),
        ["weaver", "shooter", "shield"],
      );
      for (const n of team) assert.equal(g.solid(n.x, n.y, 11), false);
      assert.equal(lineClear(g, team[0], team[1]), true);
    }
  const { g, a, b } = cord();
  g.hazards = [];
  g.tiles[7][12] = 2;
  assert.equal(lineClear(g, a, b), false);
  a.state = "move";
  a.timer = 0;
  g.history = Array.from({ length: 24 }, () => ({ x: 220, y: 220 }));
  g.updateEnemy(a, 1 / 60);
  assert.equal(
    g.hazards.some((h) => h.kind === "cord"),
    false,
  );
  assert.ok(g.hazards.some((h) => h.kind === "stolenEcho"));
});

test("切断の記録を保存でき、死亡したフレームの後続の攻撃を進めない", () => {
  const { g, h } = cord();
  g.run.hp = 5;
  g.player.x = h.x;
  g.player.y = h.y;
  h.age = 0.84;
  const later = {
    kind: "bloom",
    x: 80,
    y: 80,
    r: 20,
    age: 0.2,
    duration: 1.5,
    damage: 10,
    weavable: true,
    charge: 0,
  };
  g.hazards.push(later);
  g.updateHazards(0.02);
  assert.equal(g.mode, "dead");
  assert.equal(later.age, 0.2);
  const p = freshProfile();
  p.run = createRun("CUT-SAVE");
  p.run.cordCuts = 3;
  assert.equal(validateProfile(p).run.cordCuts, 3);
  delete p.run.cordCuts;
  assert.equal(validateProfile(p).run.cordCuts, 0);
});
