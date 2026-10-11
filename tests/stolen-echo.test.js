import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import {
  stealEcho,
  stolenPosition,
  stolenSegments,
  reclaimEcho,
} from "../src/stolen-echo.js";
import { freshProfile, validateProfile } from "../src/save.js";
import { segmentDistance, distance } from "../src/math.js";

function arena() {
  const run = createRun("STOLEN-ROUTE");
  run.stage = 8;
  const g = new Game(run);
  g.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 65 }];
  for (const row of g.tiles)
    for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  g.player.x = 140;
  g.player.y = 190;
  // Record normal production movement, including a bend, at the game's 60 Hz.
  for (let i = 0; i < 30; i++) g.update(1 / 60, { mx: 1 });
  for (let i = 0; i < 30; i++) g.update(1 / 60, { my: -1 });
  const owner = g.spawn("weaver", 340, 70);
  owner.timer = 0;
  g.updateEnemy(owner, 1 / 60);
  const h = g.hazards.find((n) => n.kind === "stolenEcho");
  assert.ok(h);
  return { g, owner, h };
}

test("糸喰いは実際の昨日を複製して逆順に再生し、予告後の移動を追尾しない", () => {
  const { g, owner, h } = arena();
  assert.deepEqual(h.frames, [...g.history].reverse());
  const copied = structuredClone(h.frames);
  g.history[0].x = 999;
  g.history.push({ x: 10, y: 10 });
  g.player.x = 400;
  g.player.y = 230;
  assert.deepEqual(h.frames, copied);
  assert.ok(
    Math.abs(stolenPosition(h, h.warning + 12 / 120).x - copied[12].x) < 1e-8,
  );
  assert.ok(
    Math.abs(stolenPosition(h, h.warning + 12 / 120).y - copied[12].y) < 1e-8,
  );
  const position = { x: owner.x, y: owner.y };
  g.updateEnemy(owner, 0.4);
  assert.deepEqual({ x: owner.x, y: owner.y }, position);
  assert.equal(owner.state, "steal");
});

test("短い記録では盗まず、複数の糸喰いが同時に影を増やさない", () => {
  const { g, h } = arena();
  const other = g.spawn("weaver", 380, 100);
  assert.equal(stealEcho(g, other), false);
  h.cancelled = true;
  g.history = g.history.slice(0, 23);
  assert.equal(stealEcho(g, other), false);
  g.history.push({ x: 200, y: 150 });
  assert.equal(stealEcho(g, other), true);
  assert.equal(g.hazards.filter((n) => !n.cancelled).length, 1);
});

test("予告は接触も光糸も無害で、動き出した影だけが一度傷つける", () => {
  const { g, h } = arena();
  g.player.x = h.x;
  g.player.y = h.y;
  g.echoes = [{ x: h.x + 80, y: h.y }];
  const hp = g.run.hp;
  g.updateHazards(h.warning - 0.01);
  assert.equal(g.run.hp, hp);
  assert.equal(g.run.memoryCuts, 0);
  g.echoes = [];
  g.updateHazards(0.02);
  assert.equal(g.run.hp, hp - 11);
  assert.equal(h.hit, true);
  g.player.invulnerable = 0;
  g.updateHazards(0.01);
  assert.equal(g.run.hp, hp - 11);
});

test("回避の無敵時間で影を避ければ同じ影から後で追撃されない", () => {
  const { g, h } = arena();
  h.age = h.warning - 0.01;
  g.player.x = h.x;
  g.player.y = h.y;
  g.dash(1, 0);
  const hp = g.run.hp;
  g.updateHazards(0.02);
  assert.equal(h.hit, true);
  assert.equal(g.run.hp, hp);
  g.player.invulnerable = 0;
  g.updateHazards(0.01);
  assert.equal(g.run.hp, hp);
});

test("高速な逆走でも記録した曲がり角を保存し、移動の間をすり抜けない", () => {
  const { g, h } = arena();
  h.frames = [
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 200, y: 200 },
  ];
  const segments = stolenSegments(h, h.warning, h.warning + 2 / 120);
  assert.deepEqual(segments[0], [
    { ...stolenPosition(h, h.warning) },
    h.frames[1],
  ]);
  assert.ok(
    segments.every(([a, b]) => segmentDistance({ x: 150, y: 150 }, a, b) >= 50),
  );
  g.player.x = 100;
  g.player.y = 150;
  h.age = h.warning;
  g.updateHazards(2 / 120);
  assert.equal(g.run.damageTaken, 11);
  const other = arena();
  other.h.frames = h.frames;
  other.g.player.x = 150;
  other.g.player.y = 150;
  other.h.age = other.h.warning;
  other.g.updateHazards(2 / 120);
  assert.equal(other.g.run.damageTaken, 0);
});

test("光糸で動く影をほどけば接触より先に反撃し、撃破回復は一度だけ働く", () => {
  const { g, owner, h } = arena();
  owner.hp = 14;
  g.addUpgrade("suture");
  g.run.hp = 50;
  g.player.x = h.x;
  g.player.y = h.y;
  g.echoes = [{ x: h.x + 80, y: h.y }];
  h.age = h.warning - 0.01;
  g.updateHazards(0.02);
  assert.equal(g.run.memoryCuts, 1);
  assert.equal(g.run.kills, 1);
  assert.equal(g.run.threadKills, 1);
  assert.equal(g.run.hp, 52);
  assert.equal(g.run.damageTaken, 0);
  assert.equal(reclaimEcho(g, h), false);
  assert.equal(g.run.memoryCuts, 1);
  assert.equal(g.run.hp, 52);
});

test("離れた光糸と重なった残響は影をほどかず、命中した反撃は敵を休止させる", () => {
  const { g, owner, h } = arena();
  g.player.x = 80;
  g.player.y = 240;
  g.echoes = [{ x: 180, y: 240 }];
  h.age = h.warning;
  g.updateHazards(0.01);
  assert.equal(g.run.memoryCuts, 0);
  g.echoes = [{ x: 80, y: 240 }];
  g.updateHazards(0.01);
  assert.equal(g.run.memoryCuts, 0);
  const hp = owner.hp;
  assert.equal(reclaimEcho(g, h), true);
  assert.equal(owner.hp, hp - 16);
  assert.equal(owner.state, "recover");
  g.updateEnemy(owner, 0.1);
  assert.equal(owner.state, "recover");
});

test("予告中も残響の解放で奪い返せ、遠い敵の反撃撃破も再充填へ還元する", () => {
  const { g, owner, h } = arena();
  g.addUpgrade("refund");
  g.addUpgrade("suture");
  g.player.echoCd = 5;
  g.run.hp = 50;
  owner.hp = 14;
  g.echoes = [
    { x: h.x, y: h.y },
    { x: h.x, y: h.y },
  ];
  assert.ok(distance(owner, h) > g.stats.burstRadius + owner.r);
  g.release();
  assert.equal(g.run.memoryCuts, 1);
  assert.equal(g.run.kills, 1);
  assert.equal(g.run.threadKills, 0);
  assert.equal(g.run.hp, 50);
  assert.equal(g.player.echoCd, 4);
  assert.equal(g.echoes.length, 0);
  const far = arena();
  far.g.echoes = [{ x: 420, y: 250 }];
  far.g.release();
  assert.equal(far.g.run.memoryCuts, 0);
});

test("敵の死亡と影の寿命では無料の反撃を数えず、終了後は次の攻撃へ回復する", () => {
  const first = arena();
  first.g.damageEnemy(first.owner, first.owner.hp, "shot");
  first.g.updateHazards(0.01);
  assert.equal(first.g.hazards.length, 0);
  assert.equal(first.g.run.memoryCuts, 0);
  const last = arena();
  last.h.age = last.h.duration - 0.001;
  last.g.updateHazards(0.002);
  assert.equal(last.g.hazards.length, 0);
  assert.equal(last.g.run.memoryCuts, 0);
  last.g.updateEnemy(last.owner, 0.01);
  assert.equal(last.owner.state, "recover");
  last.g.updateEnemy(last.owner, 0.6);
  assert.equal(last.owner.state, "move");
});

test("奪い返した昨日を保存でき、致死接触の後に他の危険を進めない", () => {
  const { g, h } = arena();
  g.run.hp = 5;
  g.player.x = h.x;
  g.player.y = h.y;
  h.age = h.warning - 0.01;
  const later = {
    kind: "bloom",
    x: 80,
    y: 80,
    r: 20,
    age: 0,
    duration: 1.5,
    damage: 10,
  };
  g.hazards.push(later);
  g.updateHazards(0.02);
  assert.equal(g.mode, "dead");
  assert.equal(later.age, 0);
  const p = freshProfile();
  p.run = createRun("STOLEN-SAVE");
  p.run.memoryCuts = 3;
  assert.equal(validateProfile(p).run.memoryCuts, 3);
  delete p.run.memoryCuts;
  assert.equal(validateProfile(p).run.memoryCuts, 0);
});
