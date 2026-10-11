import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { circleHitTime } from "../src/shot-path.js";
import { freshProfile, validateProfile } from "../src/save.js";

function arena(weapon = "prism") {
  const g = new Game(createRun("LENS-TEST", weapon));
  g.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 65 }];
  g.player.x = 80;
  g.player.y = 160;
  for (const row of g.tiles)
    for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  return g;
}
const lens = (x = 160, y = 160) => ({ x, y, r: 5 });
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test("移動区間は円への最初の接触・接線・逆方向・重なり・静止を判定する", () => {
  const p = (x, y) => ({ x, y });
  close(circleHitTime(p(0, 0), p(20, 0), p(10, 0), 2), 0.4);
  close(circleHitTime(p(20, 0), p(0, 0), p(10, 0), 2), 0.4);
  close(circleHitTime(p(0, 0), p(20, 0), p(10, 2), 2), 0.5);
  assert.equal(circleHitTime(p(0, 0), p(20, 0), p(10, 2.01), 2), null);
  assert.equal(circleHitTime(p(0, 0), p(0, 0), p(10, 0), 2), null);
  assert.equal(circleHitTime(p(10, 0), p(20, 0), p(10, 0), 2), 0);
  assert.equal(circleHitTime(p(0, 0), p(20, 0), p(-10, 0), 2), null);
});

test("離れた残響を通った硝子針は元の光を保ち、左右へ30%の光片を一度だけ加える", () => {
  const g = arena();
  g.echoes = [lens(), lens(260)];
  g.shoot(g.player, 0, false);
  const parent = g.bullets[0];
  g.updateBullets(0.4);
  assert.equal(g.run.prismSplits, 1);
  assert.equal(g.bullets.length, 3);
  assert.ok(parent.refracted);
  close(parent.damage, 23);
  const rays = g.bullets.filter((b) => b.fragment);
  for (const [i, ray] of rays.entries()) {
    close(ray.damage, 6.9);
    close(ray.angle, ((i === 0 ? -1 : 1) * Math.PI) / 9);
    assert.ok(ray.life > parent.life && ray.life < 1.8);
    assert.equal(ray.pierce, 0);
    assert.equal(ray.prismatic, undefined);
    assert.ok(
      ray.x < parent.x,
      "New rays do not receive an extra full tick at birth",
    );
  }
  g.updateBullets(0.3);
  assert.equal(g.run.prismSplits, 1);
  assert.equal(g.bullets.filter((b) => b.fragment).length, 2);
});

test("自分の身体や重なった残響では分光せず、別の離れた昨日は再生した針を分ける", () => {
  const g = arena();
  const source = lens(80);
  source.frames = [{ x: 80, y: 160, angle: 0, fire: true }];
  g.echoes = [source, lens(80)];
  g.shoot(source, 0, true);
  g.updateBullets(0.1);
  assert.equal(g.run.prismSplits, 0);
  g.echoes.push(lens());
  const recorded = structuredClone(source.frames);
  g.updateBullets(0.3);
  assert.equal(g.run.prismSplits, 1);
  assert.deepEqual(source.frames, recorded);
  assert.ok(g.bullets.filter((b) => b.fragment).every((b) => b.echo));
});

test("通常の針・散弾・回避の追加弾・敵弾・盗まれた影は分光しない", () => {
  for (const weapon of ["needle", "scatter"]) {
    const g = arena(weapon);
    g.echoes = [lens()];
    g.shoot(g.player, 0, false);
    g.updateBullets(0.4);
    assert.equal(g.run.prismSplits, 0);
  }
  const g = arena();
  g.hazards.push({ kind: "stolenEcho", ...lens() });
  g.shoot(g.player, 0, false);
  g.updateBullets(0.4);
  assert.equal(g.run.prismSplits, 0);
  g.echoes = [lens()];
  g.bullets = [];
  g.makeBullet(g.player, 0, 10, 340, true, "#fff");
  g.makeBullet(g.player, 0, 10, 340, false, "#fff");
  g.updateBullets(0.4);
  assert.equal(g.run.prismSplits, 0);
});

test("壁の後ろでは分光せず、壁より先の残響では光片を作る", () => {
  const g = arena();
  g.tiles[9][11] = 2; // x 192..208, y 160..176
  g.echoes = [lens(240)];
  const front = g.spawn("crawler", 140, 160),
    behind = g.spawn("crawler", 250, 160);
  const hp = front.hp,
    behindHp = behind.hp;
  g.shoot(g.player, 0, false);
  g.updateBullets(0.7);
  assert.equal(g.run.prismSplits, 0);
  assert.equal(front.hp, hp - 23);
  assert.equal(behind.hp, behindHp);
  assert.equal(g.bullets.length, 0);
  const before = arena();
  before.tiles[9][11] = 2;
  before.echoes = [lens()];
  before.shoot(before.player, 0, false);
  before.updateBullets(0.7);
  assert.equal(before.run.prismSplits, 1);
  assert.equal(before.bullets.filter((b) => b.fragment).length, 2);
});

test("貫通が尽きた敵より後ろでは分光せず、配列順によらず手前から命中する", () => {
  const g = arena();
  g.echoes = [lens(230)];
  const far = g.spawn("crawler", 280, 160),
    near = g.spawn("crawler", 140, 160);
  const farHp = far.hp,
    nearHp = near.hp;
  g.shoot(g.player, 0, false);
  g.bullets[0].pierce = 0;
  g.updateBullets(0.7);
  assert.equal(near.hp, nearHp - 23);
  assert.equal(far.hp, farHp);
  assert.equal(g.run.prismSplits, 0);
});

test("貫通針は各敵へ一度ずつ当たり、最後の貫通より遠い敵を傷つけない", () => {
  const g = arena();
  const targets = [300, 140, 240, 190].map((x) => g.spawn("crawler", x, 160));
  const before = targets.map((e) => e.hp);
  g.shoot(g.player, 0, false);
  g.updateBullets(0.8);
  targets.forEach((e, i) => assert.equal(e.hp, before[i] - (i === 0 ? 0 : 23)));
  assert.equal(g.bullets.length, 0);
});

test("左右の光片は実際に斜めの敵へ届き、元の針が当たらない位置も攻撃できる", () => {
  const g = arena();
  g.echoes = [lens()];
  const enemy = g.spawn("crawler", 196, 143),
    hp = enemy.hp;
  g.shoot(g.player, 0, false);
  g.updateBullets(0.4);
  assert.equal(enemy.hp, hp);
  g.updateBullets(0.2);
  close(enemy.hp, hp - 6.9);
  assert.equal(g.run.prismSplits, 1);
});

test("高速な敵弾も区間で接触し、手前に壁があればプレイヤーへ届かない", () => {
  const g = arena();
  g.player.x = 240;
  g.makeBullet({ x: 80, y: 160 }, 0, 11, 340, false, "#fff");
  g.updateBullets(0.7);
  assert.equal(g.run.damageTaken, 11);
  assert.equal(g.bullets.length, 0);
  const covered = arena();
  covered.player.x = 240;
  covered.tiles[9][11] = 2;
  covered.makeBullet({ x: 80, y: 160 }, 0, 11, 340, false, "#fff");
  covered.updateBullets(0.7);
  assert.equal(covered.run.damageTaken, 0);
});

test("寿命を越えるフレームでも弾は残る射程だけ進み、期限の後に敵へ当たらない", () => {
  const g = arena("needle");
  const enemy = g.spawn("crawler", 140, 160),
    hp = enemy.hp;
  g.shoot(g.player, 0, false);
  const b = g.bullets[0];
  b.life = 0.1;
  g.updateBullets(0.5);
  close(b.x, 111);
  assert.equal(enemy.hp, hp);
  assert.equal(g.bullets.length, 0);
});

test("潮騒は近距離の五片を重ねられ、遠い敵には届かず、残響の散弾も同じ射程になる", () => {
  for (const echo of [false, true]) {
    const g = arena("scatter");
    const near = g.spawn("crawler", 110, 160),
      far = g.spawn("crawler", 300, 160);
    near.hp = 100;
    const farHp = far.hp;
    g.shoot(g.player, 0, echo);
    assert.ok(g.bullets.every((b) => b.life === 0.72));
    g.updateBullets(1);
    close(near.hp, 100 - 50 * (echo ? g.stats.echoDamage : 1));
    assert.equal(far.hp, farHp);
    assert.equal(g.bullets.length, 0);
  }
});

test("分光の記録を保存・移行でき、致命的な敵弾の後に分光を増やさない", () => {
  const g = arena();
  g.run.hp = 5;
  g.makeBullet({ x: g.player.x, y: g.player.y }, 0, 10, 0, false, "#fff");
  g.echoes = [lens()];
  g.shoot(g.player, 0, false);
  g.updateBullets(0.4);
  assert.equal(g.mode, "dead");
  assert.equal(g.run.prismSplits, 0);
  const profile = freshProfile();
  profile.run = createRun("SPLIT-SAVE", "prism");
  profile.run.prismSplits = 7;
  assert.equal(validateProfile(profile).run.prismSplits, 7);
  delete profile.run.prismSplits;
  assert.equal(validateProfile(profile).run.prismSplits, 0);
});
