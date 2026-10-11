import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { needleMarks, NEEDLE_STITCH } from "../src/needle-stitch.js";
import { freshProfile, exportProfile, prepareImport } from "../src/save.js";

function room(weapon = "needle", kind = "shooter", hp = 1000) {
  const run = createRun("NEEDLE-STITCH", weapon);
  const game = new Game(run);
  game.spawnQueue = [];
  game.enemies = [];
  for (const row of game.tiles)
    for (let x = 0; x < row.length; x++) if (row[x] === 2) row[x] = 0;
  Object.assign(game.player, { x: 180, y: 160 });
  const enemy = game.spawn(kind, 220, 160);
  enemy.hp = enemy.maxHp = hp;
  return { game, enemy };
}

function hit(game, echo = false) {
  game.shoot(game.player, 0, echo);
  game.t += 0.2;
  game.updateBullets(0.2);
}

test("現在の針を残響の針で合わせ、実際の命中へ追加する", () => {
  const { game, enemy } = room();
  hit(game);
  assert.equal(enemy.hp, 988);
  assert.equal(needleMarks(enemy, game.t).length, 1);
  hit(game, true);
  assert.ok(Math.abs(enemy.hp - 974.8) < 1e-9);
  assert.equal(needleMarks(enemy, game.t).length, 0);
  assert.equal(game.run.needleStitches, 1);
  hit(game, true);
  assert.ok(Math.abs(enemy.hp - 967.6) < 1e-9);
  assert.equal(game.run.needleStitches, 1);
});

test("針目は最大三つで、古い針目から一つずつ使う", () => {
  const { game, enemy } = room();
  for (let i = 0; i < 4; i++) hit(game);
  const marks = needleMarks(enemy, game.t);
  assert.equal(marks.length, 3);
  assert.ok(Math.abs(marks[0].until - 1.6) < 1e-9);
  hit(game, true);
  assert.equal(needleMarks(enemy, game.t).length, 2);
  assert.equal(game.run.needleStitches, 1);
});

test("同じフレームの二つの残響の針は、一つの針目を二度使わない", () => {
  const { game, enemy } = room();
  hit(game);
  game.shoot(game.player, 0, true);
  game.shoot(game.player, 0, true);
  game.t += 0.2;
  game.updateBullets(0.2);
  assert.ok(Math.abs(enemy.hp - 967.6) < 1e-9);
  assert.equal(game.run.needleStitches, 1);
  assert.equal(needleMarks(enemy, game.t).length, 0);
});

test("針目を読むだけでは状態を変えず、寿命の境界で使えなくなる", () => {
  const { game, enemy } = room();
  hit(game);
  const until = enemy.needleMarks[0].until;
  const before = JSON.stringify(game);
  assert.equal(needleMarks(enemy, until - 1e-9).length, 1);
  assert.equal(needleMarks(enemy, until).length, 0);
  assert.equal(JSON.stringify(game), before);
  game.t = until;
  hit(game, true);
  assert.equal(game.run.needleStitches, 0);
  assert.ok(Math.abs(enemy.hp - 980.8) < 1e-9);
});

test("残響だけ・別の敵・別の武器・返し針は針目を増やさない", () => {
  const { game, enemy } = room();
  hit(game, true);
  assert.equal(needleMarks(enemy, game.t).length, 0);
  const other = game.spawn("shooter", 280, 210);
  hit(game);
  assert.equal(needleMarks(other, game.t).length, 0);
  const returned = game.makeBullet(game.player, 0, 12, 260, true, "#b9edd0");
  returned.echo = returned.returnedLight = true;
  game.t += 0.2;
  game.updateBullets(0.2);
  assert.equal(needleMarks(enemy, game.t).length, 1);
  assert.equal(game.run.needleStitches, 0);
  for (const weapon of ["scatter", "prism"]) {
    const scene = room(weapon);
    hit(scene.game);
    hit(scene.game, true);
    assert.equal(needleMarks(scene.enemy, scene.game.t).length, 0);
    assert.equal(scene.game.run.needleStitches, 0);
  }
});

test("強化と会心で実際に当てた針の威力を記録し、重ねた一撃へ使う", () => {
  const { game, enemy } = room();
  game.addUpgrade("damage");
  game.addUpgrade("crit");
  game.rng.next = () => 0;
  hit(game);
  assert.ok(Math.abs(enemy.needleMarks[0].damage - 28.8) < 1e-9);
  const before = enemy.hp;
  hit(game, true);
  assert.ok(Math.abs(before - enemy.hp - (28.8 * 0.6 + 28.8 * 0.5)) < 1e-9);
  assert.equal(game.run.needleStitches, 1);
});

test("盾の正面と記憶の護りを追加の光も通る", () => {
  const shield = room("needle", "shield");
  shield.enemy.angle = Math.PI;
  hit(shield.game);
  assert.equal(shield.enemy.needleMarks[0].damage, 3);
  const before = shield.enemy.hp;
  hit(shield.game, true);
  assert.ok(Math.abs(before - shield.enemy.hp - (7.2 + 1.5) * 0.25) < 1e-9);
  const ward = room();
  ward.enemy.ward = true;
  hit(ward.game);
  assert.ok(Math.abs(ward.enemy.needleMarks[0].damage - 2.4) < 1e-9);
  const guarded = ward.enemy.hp;
  hit(ward.game, true);
  assert.ok(Math.abs(guarded - ward.enemy.hp - (7.2 + 1.2) * 0.5) < 1e-9);
});

test("重ねた一撃で倒しても撃破と報酬を一度だけ受け取る", () => {
  const { game, enemy } = room("needle", "shooter", 22);
  hit(game);
  hit(game, true);
  assert.ok(enemy.hp <= 0);
  assert.equal(game.run.kills, 1);
  assert.equal(game.run.needleStitches, 1);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.pickups.filter((p) => p.kind === "scrap").length, 1);
  hit(game, true);
  assert.equal(game.run.kills, 1);
  assert.equal(game.run.needleStitches, 1);
});

test("壁の後ろには針目を付けず、貫通した敵はそれぞれ一度だけ合わせる", () => {
  const blocked = room();
  blocked.game.solid = (x) => x >= 195 && x <= 205;
  hit(blocked.game);
  assert.equal(blocked.enemy.hp, 1000);
  assert.equal(needleMarks(blocked.enemy, blocked.game.t).length, 0);
  const { game, enemy } = room();
  game.addUpgrade("pierce");
  const other = game.spawn("shooter", 250, 160);
  other.hp = other.maxHp = 1000;
  hit(game);
  game.t += 0.1;
  game.updateBullets(0.1);
  assert.equal(needleMarks(enemy, game.t).length, 1);
  assert.equal(needleMarks(other, game.t).length, 1);
  hit(game, true);
  game.t += 0.1;
  game.updateBullets(0.1);
  assert.equal(game.run.needleStitches, 2);
  assert.equal(needleMarks(enemy, game.t).length, 0);
  assert.equal(needleMarks(other, game.t).length, 0);
});

test("合わせた回数は移行と再開へ残し、敵の針目は保存しない", () => {
  const { game } = room();
  hit(game);
  hit(game, true);
  const profile = freshProfile();
  profile.run = game.run;
  const exported = exportProfile(profile);
  const run = prepareImport(exported).profile.run;
  assert.equal(run.needleStitches, 1);
  assert.equal(exported.includes("needleMarks"), false);
  assert.equal(new Game(run).run.needleStitches, 1);
  const old = structuredClone(profile);
  delete old.run.needleStitches;
  assert.equal(
    prepareImport(JSON.stringify(old)).profile.run.needleStitches,
    0,
  );
  for (const value of [-1, 1.2, null, "2", Number.MAX_SAFE_INTEGER + 1]) {
    old.run.needleStitches = value;
    assert.equal(
      prepareImport(JSON.stringify(old)).profile.run.needleStitches,
      0,
    );
  }
  assert.equal(NEEDLE_STITCH.seconds, 1.2);
});
