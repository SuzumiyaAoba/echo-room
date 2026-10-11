import test from "node:test";
import assert from "node:assert/strict";
import { Random } from "../src/math.js";
import { WEAPONS } from "../src/content.js";
import { Game, createRun } from "../src/game.js";
import {
  Game as BeforeGame,
  createRun as beforeRun,
} from "./fixtures/bell-before/game.js";
import {
  freshProfile,
  validateProfile,
  exportProfile,
  prepareImport,
} from "../src/save.js";
import { validateProfile as beforeValidate } from "./fixtures/return-before/save.js";
import {
  makeReturnRecord,
  normalizeReturnRecord,
  returnReadout,
} from "../src/return-record.js";
import { weavesBell, bellSeconds } from "../src/bell-weave.js";

function arena({ charges = 0, cooldown = 2, upgrades = {} } = {}) {
  const run = createRun("BELL-UNIT", "needle", "bell");
  run.upgrades = upgrades;
  const sounds = [];
  const game = new Game(run, (event, data) => {
    if (event === "sound") sounds.push(data);
  });
  game.enemies = [];
  game.spawnQueue = [];
  game.player.echoCharges = charges;
  game.player.echoCd = cooldown;
  return { game, sounds };
}
function bullet(game, dx = 0, friendly = false) {
  return game.makeBullet(
    { x: game.player.x + dx - 4, y: game.player.y },
    0,
    10,
    80,
    friendly,
    "#fff",
    0,
    false,
  );
}

test("鈴の新しい旅だけを区別し、ほかのお守りに鈴の記録を追加しない", () => {
  assert.equal(weavesBell(createRun("B", "needle", "bell")), true);
  for (const relic of ["spool", "ember"]) {
    const current = createRun("B", "needle", relic);
    delete current.encounterVersion; // The encounter marker is independent of Bell.
    assert.deepEqual(current, {
      ...beforeRun("B", "needle", relic),
      chargeVersion: 1,
    });
    assert.equal(
      Object.hasOwn(createRun("B", "needle", relic), "bellVersion"),
      false,
    );
  }
  assert.equal(weavesBell(beforeRun("B", "needle", "bell")), false);
});

test("出発点38の敵弾だけを消し、味方・外側・返し針を残して実際の充填を戻す", () => {
  const { game, sounds } = arena();
  const outside = bullet(game, 38.001);
  const friendly = bullet(game, 0, true);
  friendly.returnedLight = true;
  bullet(game, 0);
  bullet(game, 38);
  bullet(game, -20);
  const origin = { x: game.player.x, y: game.player.y };
  const beforeRng = game.rng.state;
  game.dash(1, 0);
  assert.deepEqual(game.bullets, [outside, friendly]);
  assert.equal(game.run.bellCuts, 3);
  assert.ok(Math.abs(game.run.bellRecovered - 0.9) < 1e-12);
  assert.ok(Math.abs(game.player.echoCd - 1.1) < 1e-12);
  assert.deepEqual({ x: game.bellPulse.x, y: game.bellPulse.y }, origin);
  assert.equal(game.bellPulse.cuts, 3);
  assert.equal(game.rng.state, beforeRng);
  assert.deepEqual(sounds.slice(-2), ["dash", "bell"]);
  assert.equal(game.labels.at(-1).text, "鈴 −0.9秒");
});

test("消した弾は全発を記録し、回復は0.9秒と残り時間の小さい方に収める", () => {
  for (const cooldown of [4, 0.12, 0.01]) {
    const { game } = arena({ cooldown });
    for (let i = 0; i < 8; i++) bullet(game, i);
    game.dash(0, 1);
    assert.equal(game.run.bellCuts, 8);
    assert.equal(game.run.bellRecovered, Math.min(cooldown, 0.9));
    assert.equal(game.player.echoCd, Math.max(0, cooldown - 0.9));
    assert.equal(game.player.echoCharges, 0);
  }
  assert.equal(bellSeconds(0.01), "<0.1");
});

test("弾なし・満充填・待ち時間なしは充填を持ち越さない", () => {
  for (const options of [{ charges: 1 }, { cooldown: 0 }, {}]) {
    const { game, sounds } = arena(options);
    if (Object.keys(options).length) bullet(game);
    const before = game.player.echoCd;
    game.dash(1, 0);
    assert.equal(game.player.echoCd, before);
    assert.equal(game.run.bellRecovered, 0);
    assert.equal(game.labels.length, 0);
    assert.equal(sounds.includes("bell"), Object.keys(options).length > 0);
  }
});

test("残響が二つ欠けても次の更新で一つだけ戻し、残る一つは通常の充填を始める", () => {
  const { game } = arena({ cooldown: 0.2, upgrades: { double: 1 } });
  for (let i = 0; i < 4; i++) bullet(game, i);
  game.dash(1, 0);
  assert.equal(game.player.echoCd, 0);
  assert.equal(game.player.echoCharges, 0);
  game.update(1 / 60, {});
  assert.equal(game.player.echoCharges, 1);
  assert.equal(game.player.echoCd, game.stats.echoCooldown);
  assert.equal(game.run.bellRecovered, 0.2);
  assert.ok(game.bellPulse.age > 0);
  game.update(0.4, {});
  assert.equal(Object.hasOwn(game, "bellPulse"), false);
});

test("回避針は消弾の後に生まれ、消した敵弾を返し針や撃破へ変えない", () => {
  const { game } = arena({
    upgrades: { dashshot: 1, threadguard: 1, counter: 1 },
  });
  for (let i = 0; i < 6; i++) bullet(game, i);
  game.dash(1, 0);
  assert.equal(game.bullets.length, 8);
  assert.ok(game.bullets.every((b) => b.friendly));
  assert.equal(game.run.bellCuts, 6);
  assert.equal(game.run.threadCuts, 0);
  assert.equal(game.run.threadReturns, 0);
  assert.equal(game.run.kills, 0);
});

test("旧旅81条件の戦闘・乱数・効果は改修前の実装と同じ", () => {
  for (const { id: weapon } of WEAPONS)
    for (const relic of ["spool", "bell", "ember"])
      for (const difficulty of [0, 1, 2])
        for (const stage of [0, 7, 23]) {
          const run = beforeRun("BELL-OLD", weapon, relic, difficulty);
          run.stage = stage;
          run.upgrades = {
            double: 1,
            quickecho: 1,
            dashshot: 1,
            threadguard: 1,
            counter: 1,
          };
          // Cosmetic particles use Math.random, independently of battle RNG.
          // Match that input too, without omitting any field from the comparison.
          function sameParticles(seed, operation) {
            const original = Math.random,
              random = new Random(seed);
            Math.random = () => random.next();
            try {
              return operation();
            } finally {
              Math.random = original;
            }
          }
          const old = sameParticles(
            1,
            () => new BeforeGame(structuredClone(run)),
          );
          const next = sameParticles(1, () => new Game(structuredClone(run)));
          assert.equal(JSON.stringify(next), JSON.stringify(old));
          for (let tick = 0; tick < 180; tick++) {
            const input = {
              mx: Math.cos(tick / 50),
              my: Math.sin(tick / 50),
              fire: true,
              angle: -Math.PI / 2,
              dash: tick % 90 === 0,
              echo: tick % 70 === 0,
            };
            sameParticles(tick + 2, () => old.update(1 / 60, input));
            sameParticles(tick + 2, () => next.update(1 / 60, input));
          }
          assert.equal(
            JSON.stringify(next),
            JSON.stringify(old),
            [weapon, relic, difficulty, stage].join("/"),
          );
        }
});

test("旧鈴の保存を旧パーサと同じに保ち、新鈴の計数を通常保存・公開書き出しで保持する", () => {
  const old = freshProfile();
  old.run = beforeRun("BELL-OLD", "prism", "bell");
  assert.deepEqual(validateProfile(old), beforeValidate(old));
  const p = freshProfile();
  p.unlocked.push("bell");
  p.run = createRun("BELL-NEW", "needle", "bell");
  Object.assign(p.run, { bellCuts: 8, bellRecovered: 0.12 });
  const normalized = validateProfile(p);
  assert.equal(normalized.run.bellVersion, 2);
  assert.equal(normalized.run.bellCuts, 8);
  assert.equal(normalized.run.bellRecovered, 0.12);
  assert.deepEqual(
    prepareImport(exportProfile(normalized)).profile,
    normalized,
  );
  p.run.bellCuts = NaN;
  p.run.bellRecovered = -1;
  assert.equal(validateProfile(p).run.bellCuts, 0);
  assert.equal(validateProfile(p).run.bellRecovered, 0);
  p.run.relic = "spool";
  assert.equal(Object.hasOwn(validateProfile(p).run, "bellVersion"), false);
});

test("実際の鈴の消弾・充填回復を帰還記録へ残し、旧鈴の説明を守る", () => {
  const { game } = arena({ cooldown: 0.12 });
  for (let i = 0; i < 5; i++) bullet(game, i);
  game.dash(1, 0);
  const record = makeReturnRecord(game.run, false, 5);
  assert.equal(record.run.bellCuts, 5);
  assert.equal(record.run.bellRecovered, 0.12);
  assert.ok(
    returnReadout(record).performance.some(
      ([label, value]) => label === "鈴でほどいた弾" && value === 5,
    ),
  );
  assert.ok(
    returnReadout(record).performance.some(
      ([label, value]) => label === "鈴が戻した充填" && value === "0.1",
    ),
  );
  const p = freshProfile();
  p.lastReturn = record;
  assert.deepEqual(prepareImport(exportProfile(p)).profile.lastReturn, record);
  const bad = structuredClone(record);
  bad.run.bellCuts = -1;
  assert.equal(normalizeReturnRecord(bad), null);
  const old = makeReturnRecord(beforeRun("OLD", "needle", "bell"), false, 0);
  assert.equal(Object.hasOwn(old.run, "bellVersion"), false);
  assert.equal(
    returnReadout(old).relic.desc,
    "回避時に周囲の弾を消去。危険をすり抜ける。",
  );
  assert.equal(
    returnReadout(old).performance.some(([label]) => label.includes("鈴")),
    false,
  );
});
