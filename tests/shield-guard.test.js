import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { SHIELD_GUARD, shieldGuard } from "../src/shield-guard.js";
import {
  Game as Before,
  createRun as beforeRun,
} from "./fixtures/shell-before/game.js";
import { Random } from "../src/math.js";

function probe(Type, seed, stage, elite, facing, offset, state) {
  const previous = Math.random,
    cosmetic = new Random(seed),
    events = [];
  try {
    Math.random = () => cosmetic.next();
    const run = (Type === Game ? createRun : beforeRun)(seed);
    run.stage = stage;
    const game = new Type(run, (...args) => events.push(args));
    game.mode = "combat";
    game.spawnQueue = [];
    game.enemies = [];
    for (const row of game.tiles)
      for (let x = 0; x < row.length; x++) if (row[x] === 2) row[x] = 0;
    const enemy = game.spawn("shield", 240, 150, elite);
    enemy.angle = facing;
    enemy.state = state;
    const hp = enemy.hp,
      angle = facing + offset;
    game.makeBullet(
      { x: enemy.x + Math.cos(angle) * 60, y: enemy.y + Math.sin(angle) * 60 },
      angle + Math.PI,
      40,
      100,
      true,
      "#fff",
      0,
      facing > Math.PI,
    );
    game.updateBullets(0.6);
    return {
      game,
      enemy,
      amount: hp - enemy.hp,
      events,
      cosmetic: cosmetic.state,
    };
  } finally {
    Math.random = previous;
  }
}

test("表示の両端は元の射撃判定0.3を読み、回復中も同じ向きと幅を保つ", () => {
  const enemy = {
    kind: "shield",
    hp: 70,
    r: 10,
    x: 125.4,
    y: 90.2,
    angle: 0.8,
    state: "move",
  };
  const before = structuredClone(enemy),
    guard = shieldGuard(enemy);
  assert.equal(SHIELD_GUARD.dotThreshold, 0.3);
  assert.equal(SHIELD_GUARD.damageScale, 0.25);
  assert.equal(guard.halfAngle, Math.acos(0.3));
  assert.ok(
    Math.abs((guard.halfAngle * 180) / Math.PI - 72.54239687627792) < 1e-10,
  );
  assert.deepEqual(guard, {
    x: enemy.x,
    y: enemy.y,
    angle: enemy.angle,
    radius: 14,
    halfAngle: Math.acos(0.3),
  });
  assert.deepEqual(enemy, before);
  assert.deepEqual(shieldGuard({ ...enemy, state: "recover" }), guard);
  for (const change of [
    { kind: "crawler" },
    { hp: 0 },
    { hp: -1 },
    { hp: NaN },
    { r: 0 },
    { x: Infinity },
    { y: NaN },
    { angle: NaN },
  ])
    assert.equal(shieldGuard({ ...enemy, ...change }), null);
  assert.equal(shieldGuard(null), null);
});

test("三地域・二サイズ・16方向・12接触角・二状態2304実弾を元の全Gameへ照合する", () => {
  const half = Math.acos(0.3),
    offsets = [
      -Math.PI,
      -Math.PI / 2,
      -half - 1e-7,
      -half + 1e-7,
      -Math.PI / 3,
      -0.85,
      0,
      0.85,
      Math.PI / 3,
      half - 1e-7,
      half + 1e-7,
      Math.PI / 2,
    ];
  let cases = 0,
    originallyOutsideDisplayButGuarded = 0;
  for (const stage of [1, 9, 17])
    for (const elite of [false, true])
      for (let i = 0; i < 16; i++)
        for (const offset of offsets)
          for (const state of ["move", "recover"]) {
            const facing = (i * Math.PI) / 8,
              seed = `SHELL-SHOT-${cases}`;
            const current = probe(
                Game,
                seed,
                stage,
                elite,
                facing,
                offset,
                state,
              ),
              old = probe(Before, seed, stage, elite, facing, offset, state);
            const guarded = Math.cos(offset) > 0.3;
            assert.equal(
              current.amount,
              guarded ? 10 : 40,
              `${stage}/${elite}/${i}/${offset}/${state}`,
            );
            assert.equal(
              JSON.stringify(current.game),
              JSON.stringify(old.game),
            );
            assert.deepEqual(current.events, old.events);
            assert.equal(current.cosmetic, old.cosmetic);
            assert.equal(
              shieldGuard(current.enemy).radius,
              current.enemy.r + 4,
            );
            if (Math.abs(offset) > 0.85 && guarded)
              originallyOutsideDisplayButGuarded++;
            cases++;
          }
  assert.equal(cases, 2304);
  assert.ok(originallyOutsideDisplayButGuarded > 0);
});

test("旧旅・現旅の三地域12航路は720フレームすべての戦闘・乱数・効果を変えない", () => {
  let cases = 0;
  for (const version of [undefined, 1])
    for (const stage of [1, 9, 17])
      for (const weapon of ["needle", "prism"]) {
        const seed = `SHELL-MODEL-${cases}`,
          run = beforeRun(seed, weapon);
        run.stage = stage;
        if (version === undefined) delete run.chargeVersion;
        const current = new Game(structuredClone(run)),
          old = new Before(structuredClone(run)),
          a = new Random(seed),
          b = new Random(seed),
          previous = Math.random;
        try {
          for (let tick = 0; tick < 720; tick++) {
            const phase = tick / 90,
              controls = {
                mx: Math.cos(phase),
                my: Math.sin(phase),
                fire: true,
                echo: tick % 120 === 0,
                burst: tick % 210 === 0,
                dash: tick % 84 === 0,
              };
            Math.random = () => a.next();
            current.update(1 / 60, controls);
            Math.random = () => b.next();
            old.update(1 / 60, controls);
            assert.equal(
              JSON.stringify(current),
              JSON.stringify(old),
              `${version}/${stage}/${weapon}/${tick}`,
            );
            assert.equal(a.state, b.state);
          }
        } finally {
          Math.random = previous;
        }
        cases++;
      }
  assert.equal(cases, 12);
});

test("光糸と解放の反撃は正面の護りによる射撃軽減を受けない", () => {
  for (const source of ["thread", "burst"]) {
    const game = new Game(createRun("SHELL-BYPASS"));
    game.spawnQueue = [];
    game.enemies = [];
    const enemy = game.spawn("shield", 240, 150),
      hp = enemy.hp;
    game.damageEnemy(enemy, 40, source);
    assert.equal(hp - enemy.hp, 40);
    assert.ok(shieldGuard(enemy));
  }
});
