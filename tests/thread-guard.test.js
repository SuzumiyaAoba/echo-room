import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { capsuleHitTime } from "../src/shot-path.js";
import {
  freshProfile,
  validateProfile,
  exportProfile,
  prepareImport,
} from "../src/save.js";

const point = (x, y) => ({ x, y });
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
function arena(wide = 0, triangle = 0) {
  const run = createRun("THREAD-GUARD");
  run.upgrades = { wide, triangle };
  const game = new Game(run);
  for (const row of game.tiles)
    for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  game.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 65 }];
  game.player.x = 240;
  game.player.y = 160;
  game.echoes = [{ x: 240, y: 60, r: 5 }];
  return game;
}
function hostile(game, x, y, angle = 0, speed = 1200) {
  return game.makeBullet({ x, y }, angle, 11, speed, false, "#f00");
}

test("糸への最初の接触は高速・逆方向・平行・端・接線・静止と回転を区別する", () => {
  const a = point(0, 0),
    b = point(20, 0);
  close(capsuleHitTime(point(10, -20), point(10, 20), a, b, 2), 0.45);
  close(capsuleHitTime(point(10, 20), point(10, -20), a, b, 2), 0.45);
  close(capsuleHitTime(point(-20, 0), point(40, 0), a, b, 2), 0.3);
  close(capsuleHitTime(point(-10, 2), point(30, 2), a, b, 2), 0.25);
  assert.equal(
    capsuleHitTime(point(-10, 2.01), point(30, 2.01), a, b, 2),
    null,
  );
  assert.equal(capsuleHitTime(point(10, 0), point(10, 0), a, b, 2), 0);
  assert.equal(capsuleHitTime(point(10, 3), point(10, 3), a, b, 2), null);
  close(capsuleHitTime(point(-10, 0), point(10, 0), a, a, 2), 0.4);
  for (let degree = 0; degree < 360; degree += 15) {
    const angle = (degree * Math.PI) / 180;
    const rotate = ({ x, y }) =>
      point(
        110 + x * Math.cos(angle) - y * Math.sin(angle),
        90 + x * Math.sin(angle) + y * Math.cos(angle),
      );
    close(
      capsuleHitTime(
        rotate(point(10, -20)),
        rotate(point(10, 20)),
        rotate(a),
        rotate(b),
        2,
      ),
      0.45,
    );
  }
});

test("織片なしの光糸でも進路を横切る敵弾を接触位置で一度ほどく", () => {
  const game = arena(),
    state = game.rng.state;
  const bullet = hostile(game, 120, 110);
  game.updateThreads(1 / 60);
  assert.ok(bullet.life > 0, "弾の出発位置だけでは消さない");
  game.updateBullets(0.2);
  close(bullet.x, 234);
  assert.equal(game.run.threadCuts, 1);
  assert.equal(game.run.damageTaken, 0);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.hazards[0].kind, "threadGuard");
  assert.equal(game.guardBullet(bullet), false);
  assert.equal(game.run.threadCuts, 1);
  assert.equal(game.rng.state, state);
  assert.equal(game.run.time, 0);
  assert.equal(game.run.kills, 0);
});

test("壁・身体・糸の先に触れたものを処理し、身体の後ろの糸で被弾を取り消さない", () => {
  const shielded = arena();
  shielded.echoes = [{ x: 160, y: 160, r: 5 }];
  hostile(shielded, 80, 160);
  shielded.updateBullets(0.3);
  assert.equal(shielded.run.threadCuts, 1);
  assert.equal(shielded.run.damageTaken, 0);
  const covered = arena();
  covered.echoes = [{ x: 160, y: 160, r: 5 }];
  covered.tiles[9][8] = 2;
  hostile(covered, 80, 160);
  covered.updateBullets(0.3);
  assert.equal(covered.run.threadCuts, 0);
  assert.equal(covered.run.damageTaken, 0);
  const behind = arena(2);
  behind.echoes = [{ x: 160, y: 160, r: 5 }];
  hostile(behind, 350, 160, Math.PI);
  behind.updateBullets(0.3);
  assert.equal(behind.run.threadCuts, 0);
  assert.equal(behind.run.damageTaken, 11);
});

test("重なる・短い残響と足元への弾は最大幅でも無条件の盾にならない", () => {
  for (const wide of [0, 1, 2])
    for (const echo of [point(240, 160), point(245, 160), point(120, 160)]) {
      const game = arena(wide);
      game.echoes = [{ ...echo, r: 5 }];
      hostile(game, 240, 60, Math.PI / 2, 600);
      game.updateThreads(1 / 60);
      game.updateBullets(0.3);
      assert.equal(game.run.damageTaken, 11);
      assert.equal(game.run.threadCuts, 0);
    }
});

test("広がる織目は受け止める範囲を広げ、三角の海は残響同士の辺も守る", () => {
  for (const wide of [0, 1]) {
    const game = arena(wide);
    const bullet = hostile(game, 246, 110, 0, 50); // parallel beside a vertical thread
    bullet.x = 249;
    game.updateBullets(0.1);
    assert.equal(game.run.threadCuts, wide === 0 ? 0 : 1);
  }
  for (const triangle of [0, 1]) {
    const game = arena(0, triangle);
    game.player.y = 240;
    game.echoes = [
      { x: 120, y: 100, r: 5 },
      { x: 360, y: 100, r: 5 },
    ];
    hostile(game, 240, 50, Math.PI / 2, 600);
    game.updateBullets(0.14);
    assert.equal(game.run.threadCuts, triangle);
  }
});

test("味方の針と光片、赤い影、解放で消す弾を糸の防御へ数えない", () => {
  const game = arena();
  game.makeBullet({ x: 120, y: 110 }, 0, 11, 1200, true, "#fff");
  game.updateBullets(0.2);
  assert.equal(game.run.threadCuts, 0);
  game.echoes = [];
  game.hazards = [{ kind: "stolenEcho", x: 240, y: 110 }];
  hostile(game, 120, 110);
  game.updateBullets(0.2);
  assert.equal(game.run.threadCuts, 0);
  game.echoes = [{ x: 240, y: 110, r: 5 }];
  const bullet = hostile(game, 240, 120, 0, 0);
  game.release();
  assert.equal(bullet.life, 0);
  assert.equal(game.run.threadCuts, 0);
});

test("弾の残る寿命の区間だけ守り、寿命の最後の接触も一度数える", () => {
  const short = arena();
  hostile(short, 120, 110).life = 0.01;
  short.updateBullets(0.2);
  assert.equal(short.run.threadCuts, 0);
  const final = arena();
  hostile(final, 120, 110).life = 0.095;
  final.updateBullets(0.2);
  assert.equal(final.run.threadCuts, 1);
});

test("致命傷の後には次の弾をほどかず、停止した戦闘で回数を増やさない", () => {
  const game = arena();
  game.run.hp = 5;
  hostile(game, 240, 180, -Math.PI / 2, 600);
  const later = hostile(game, 120, 110);
  game.updateBullets(0.2);
  assert.equal(game.mode, "dead");
  assert.equal(game.run.threadCuts, 0);
  assert.ok(later.life > 0);
});

test("ほどいた弾は保存と実ファイルで保持し、旧記録と不正な回数は0へ戻す", () => {
  const profile = freshProfile();
  profile.run = createRun("GUARD-SAVE");
  profile.run.threadCuts = 117;
  assert.equal(
    prepareImport(exportProfile(profile)).profile.run.threadCuts,
    117,
  );
  for (const value of [
    undefined,
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    profile.run.threadCuts = value;
    assert.equal(validateProfile(profile).run.threadCuts, 0);
  }
});
