import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { SHOT_POSES, weaponPose } from "../src/weapon-pose.js";

function scene(weapon = "needle") {
  const game = new Game(createRun("WEAPON-POSE", weapon));
  game.spawnQueue = [{ time: Infinity }];
  return game;
}
const player = (game) => weaponPose(game, { ...game.player, type: "player" });
const echo = (game, actor) => weaponPose(game, { ...actor, type: "echo" });

test("三つの射出器は実際の射撃フレームで反動を始める", () => {
  for (const weapon of ["needle", "scatter", "prism"]) {
    const game = scene(weapon);
    assert.equal(player(game).age, null);
    game.update(1 / 60, { fire: true, angle: 0 });
    const pose = player(game);
    assert.equal(game.history.at(-1).fire, true);
    assert.equal(pose.age, 0);
    assert.equal(pose.recoil, SHOT_POSES[weapon].recoil);
    assert.equal(pose.x, game.player.x - pose.recoil);
    assert.equal(pose.y, game.player.y);
    assert.equal(pose.muzzle, true);
  }
});

test("銃口の二フレームと反動の期限は進んだ記録で終わる", () => {
  const game = scene();
  game.update(1 / 60, { fire: true, angle: 0 });
  game.update(1 / 60);
  assert.equal(player(game).muzzle, true);
  game.update(1 / 60);
  assert.equal(player(game).muzzle, false);
  for (let i = 0; i < 4; i++) game.update(1 / 60);
  assert.equal(player(game).age, null);
  assert.equal(player(game).x, game.player.x);
});

test("連射を強化しても発射しなかったフレームを射撃にしない", () => {
  const game = scene();
  for (let i = 0; i < 3; i++) game.addUpgrade("rapid");
  let shots = 0;
  for (let i = 0; i < 60; i++) {
    game.update(1 / 60, { fire: true, angle: 0 });
    if (game.history.at(-1).fire) {
      shots++;
      assert.equal(player(game).age, 0);
    } else assert.notEqual(player(game).age, 0);
  }
  assert.ok(shots > 5);
});

test("実際の残響は再生した射撃でだけ反動を始める", () => {
  const game = scene();
  for (let i = 0; i < 24; i++) game.update(1 / 60, { fire: true, angle: 0 });
  game.castEcho();
  const actor = game.echoes[0];
  assert.equal(echo(game, actor).age, null);
  game.update(1 / 60);
  assert.equal(actor.frame, 0);
  assert.equal(actor.frames[0].fire, true);
  assert.equal(echo(game, actor).age, 0);
  assert.equal(echo(game, actor).muzzle, true);
});

test("これから再生する射撃は見せず、発射した時点で姿勢へ反映する", () => {
  const game = scene();
  for (let i = 0; i < 24; i++) game.update(1 / 60, { fire: true, angle: 0 });
  game.castEcho();
  const actor = game.echoes[0];
  const next = actor.frames.findIndex((frame, i) => i > 0 && frame.fire);
  assert.ok(next > 6);
  for (let i = 0; i < next; i++) game.update(1 / 60);
  assert.equal(actor.frame, next - 1);
  assert.equal(echo(game, actor).age, null);
  game.update(1 / 60);
  assert.equal(actor.frame, next);
  assert.ok(echo(game, actor).age < 1e-7);
});

test("残響が最後の位置に留まっても最後の射撃を繰り返さない", () => {
  const game = scene();
  for (let i = 0; i < 29; i++) game.update(1 / 60, { fire: true, angle: 0 });
  game.castEcho();
  const actor = game.echoes[0];
  assert.equal(actor.frames.at(-1).fire, true);
  for (let i = 0; i < actor.frames.length; i++) game.update(1 / 60);
  assert.ok(echo(game, actor).age < 1e-7);
  for (let i = 0; i < 8; i++) game.update(1 / 60);
  assert.equal(actor.frame, actor.frames.length - 1);
  assert.equal(echo(game, actor).age, null);
});

test("反動は発射した向きから返し、照準は現在の向きを保つ", () => {
  const game = scene("scatter");
  game.update(1 / 60, { fire: true, angle: Math.PI / 4 });
  game.update(1 / 60, { angle: Math.PI });
  const pose = player(game);
  assert.equal(pose.angle, Math.PI);
  assert.equal(pose.x, game.player.x - 1);
  assert.equal(pose.y, game.player.y - 1);
});

test("盗まれた軌跡と帰還後の姿には残響の射撃を付けない", () => {
  const game = scene();
  game.update(1 / 60, { fire: true, angle: 0 });
  assert.equal(weaponPose(game, { ...game.player, type: "stolen" }).age, null);
  for (const mode of ["reward", "dead", "event"]) {
    game.mode = mode;
    assert.equal(player(game).age, null);
  }
});

test("姿勢を何度読んでも時計・位置・保存用の航路・乱数を変えない", () => {
  const game = scene();
  game.update(1 / 60, { fire: true, angle: 0 });
  const before = JSON.stringify(game),
    rng = game.rng.state,
    expected = player(game);
  for (let i = 0; i < 100; i++) assert.deepEqual(player(game), expected);
  assert.equal(JSON.stringify(game), before);
  assert.equal(game.rng.state, rng);
  const restarted = new Game(structuredClone(game.run));
  assert.equal(player(restarted).age, null);
});
