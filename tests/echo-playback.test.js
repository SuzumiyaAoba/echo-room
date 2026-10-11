import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { Game as Before } from "./fixtures/rewind-v2/game.js";
import { rewardPlan as beforeReward } from "./fixtures/rewind-v2/rewards.js";
import { traderStock as beforeStock } from "./fixtures/rewind-v2/trader.js";
import { catalogUpgrades, WEAPONS } from "../src/content.js";
import { rewardPlan } from "../src/rewards.js";
import { traderStock } from "../src/trader.js";
import { echoRecording, recordingLabel } from "../src/recording-preview.js";
import {
  freshProfile,
  validateProfile,
  exportProfile,
  prepareImport,
} from "../src/save.js";
import { previewUpgrade } from "../src/upgrade-preview.js";

function arena(weapon = "needle") {
  const g = new Game(createRun("REWIND-PLAYBACK", weapon));
  g.spawnQueue = [{ time: Infinity }];
  return g;
}
function record(g, frames = 180, fire = true) {
  for (let i = 0; i < frames; i++)
    g.update(1 / 60, {
      mx: i < frames / 3 ? 1 : i >= (frames * 2) / 3 ? -1 : 0,
      my: i >= frames / 3 && i < (frames * 2) / 3 ? -1 : 0,
      angle: -0.9 + i / frames,
      fire,
    });
}

test("三武器の実録画を逆再生し、針の位置と向き・発射回数・最後の留め場所を保つ", () => {
  for (const weapon of WEAPONS) {
    const g = arena(weapon.id);
    assert.equal(g.addUpgrade("rewind"), true);
    record(g, 216);
    const recorded = structuredClone(g.history);
    const charges = g.player.echoCharges,
      cooldown = g.stats.echoCooldown,
      duration = g.stats.echoDuration;
    g.bullets = [];
    const shots = [],
      original = g.shoot;
    g.shoot = function (source, angle, echo) {
      if (echo) shots.push({ x: source.x, y: source.y, angle });
      return original.call(this, source, angle, echo);
    };
    g.castEcho();
    const echo = g.echoes[0];
    assert.deepEqual(g.history, recorded);
    assert.deepEqual(echo.frames, recorded.slice().reverse());
    assert.equal(echo.playback, "reverse");
    assert.equal(g.player.echoCharges, charges - 1);
    assert.equal(g.player.echoCd, cooldown);
    for (let i = 0; i < recorded.length; i++) {
      g.update(1 / 60);
      const expected = recorded[recorded.length - i - 1];
      assert.equal(echo.x, expected.x);
      assert.equal(echo.y, expected.y);
      assert.equal(echo.angle, expected.angle);
    }
    assert.deepEqual(
      shots,
      recorded
        .slice()
        .reverse()
        .filter((f) => f.fire)
        .map(({ x, y, angle }) => ({ x, y, angle })),
    );
    g.update(1 / 60);
    assert.equal(echo.moving, false);
    assert.equal(echo.x, recorded[0].x);
    assert.equal(echo.y, recorded[0].y);
    while (echo.elapsed < duration - 1 / 60) g.update(1 / 60);
    assert.equal(g.echoes.length, 1);
    g.update(1 / 60);
    assert.equal(g.echoes.length, 0);
  }
});

test("逆再生の始点・道・針の予告が実際の呼び出しと一致し、読むだけでは何も更新しない", () => {
  for (const length of [24, 60, 216]) {
    const g = arena();
    g.addUpgrade("rewind");
    record(g, length);
    const before = JSON.stringify(g);
    const rng = g.rng.state;
    for (let i = 0; i < 100; i++) {
      const r = echoRecording(g);
      assert.equal(recordingLabel(r), `逆再生 ${(length / 60).toFixed(1)}秒`);
      assert.deepEqual(r.origin, {
        x: g.history.at(-1).x,
        y: g.history.at(-1).y,
      });
      r.points[0].x = -1000;
    }
    assert.equal(JSON.stringify(g), before);
    assert.equal(g.rng.state, rng);
    const preview = echoRecording(g);
    g.castEcho();
    assert.deepEqual(
      preview.points,
      g.echoes[0].frames.map(({ x, y }) => ({ x, y })),
    );
    assert.deepEqual(
      preview.shots,
      g.echoes[0].frames.flatMap((f, frame) =>
        f.fire ? [{ x: f.x, y: f.y, angle: f.angle, frame }] : [],
      ),
    );
  }
});

test("織り込む前の残響はそのまま再生し、次に呼ぶ残響だけが折り返す", () => {
  const g = arena();
  g.addUpgrade("double");
  record(g, 90, false);
  g.castEcho();
  const first = g.echoes[0],
    original = structuredClone(first.frames);
  g.addUpgrade("rewind");
  g.castEcho();
  const second = g.echoes[1];
  assert.deepEqual(first.frames, original);
  assert.equal(first.playback, undefined);
  assert.equal(second.playback, "reverse");
  assert.deepEqual(second.frames, original.slice().reverse());
  g.history[0].x = -1000;
  assert.notEqual(first.frames[0].x, -1000);
  assert.notEqual(second.frames.at(-1).x, -1000);
  assert.equal(g.addUpgrade("rewind"), false);
});

test("逆再生で離れた残響の糸は実弾をほどいて蓄え、通常の解放で返し針にする", () => {
  const g = arena();
  g.addUpgrade("rewind");
  g.addUpgrade("counter");
  for (let i = 0; i < 90; i++) g.update(1 / 60, { mx: 1 });
  g.castEcho();
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  const echo = g.echoes[0],
    p = g.player;
  assert.ok(Math.hypot(p.x - echo.x, p.y - echo.y) > 40);
  const midpoint = { x: (p.x + echo.x) / 2, y: (p.y + echo.y) / 2 };
  const incoming = g.makeBullet(
    { x: midpoint.x, y: midpoint.y - 10 },
    Math.PI / 2,
    6,
    180,
    false,
    "#ed987e",
  );
  g.updateBullets(0.1);
  assert.equal(incoming.threadGuarded, true);
  assert.equal(g.run.threadCuts, 1);
  assert.equal(echo.returnStock, 1);
  g.spawn("crawler", echo.x, echo.y - 45);
  g.release();
  assert.equal(g.run.threadReturns, 1);
  assert.equal(g.echoes.length, 0);
  assert.ok(g.bullets.some((b) => b.friendly && b.returnedLight));
});

test("版1・2の旧航路は候補・支払い・行商・120コマ後の全状態を追加前と一致させる", () => {
  const nativeRandom = Math.random;
  try {
    Math.random = () => 0.375;
    for (const version of [1, 2])
      for (let seed = 0; seed < 3; seed++)
        for (const weapon of WEAPONS)
          for (const difficulty of [0, 1, 2])
            for (const stage of [0, 1, 5, 8, 16, 23]) {
              const run = createRun(
                `REWIND-LEGACY-${seed}`,
                weapon.id,
                "spool",
                difficulty,
              );
              delete run.encounterVersion; // This is an actual pre-encounter save.
              Object.assign(run, {
                catalogVersion: version,
                stage,
                scrap: 200,
                route: stage === 5 ? "salvage" : "loom",
                rewardRoll: 1,
              });
              run.upgrades = {
                double: 1,
                thread: 1,
                counter: version === 2 ? 1 : 0,
              };
              assert.deepEqual(rewardPlan(run), beforeReward(run));
              assert.deepEqual(traderStock(run), beforeStock(run));
              const current = new Game(structuredClone(run)),
                before = new Before(structuredClone(run));
              for (let frame = 0; frame < 120; frame++) {
                const input = {
                  mx: frame < 60 ? 1 : -1,
                  fire: true,
                  angle: -0.8,
                  echo: frame === 40,
                  burst: frame === 95,
                };
                current.update(1 / 60, input);
                before.update(1 / 60, input);
              }
              assert.equal(
                JSON.stringify(current),
                JSON.stringify(before),
                `${version}/${seed}/${weapon.id}/${difficulty}/${stage}`,
              );
            }
  } finally {
    Math.random = nativeRandom;
  }
});

test("三つの候補版を保存し、版3の逆再生だけを実ファイルへ持ち運ぶ", () => {
  for (const version of [1, 2, 3, undefined, "3", 4]) {
    const profile = freshProfile();
    profile.run = createRun("REWIND-SAVE");
    profile.run.catalogVersion = version;
    profile.run.upgrades = { rewind: 1, counter: 1, duration: 2 };
    const restored = prepareImport(exportProfile(profile)).profile.run;
    const expected = [2, 3].includes(version) ? version : 1;
    assert.equal(restored.catalogVersion, expected);
    assert.equal(restored.upgrades.rewind, expected === 3 ? 1 : 0);
    assert.equal(restored.upgrades.counter, expected >= 2 ? 1 : 0);
    assert.equal(restored.upgrades.duration, 2);
    assert.equal(
      catalogUpgrades(restored).length,
      expected === 3 ? 26 : expected === 2 ? 25 : 24,
    );
    assert.deepEqual(
      validateProfile({ ...profile, run: restored }).run,
      restored,
    );
  }
});

test("取得前の比較は再生後の留め場所を示し、旧候補へ新しい織片を混ぜない", () => {
  const run = createRun("REWIND-CHOICE");
  const before = structuredClone(run);
  const preview = previewUpgrade(run, "rewind");
  assert.deepEqual(
    preview.rows.map((r) => [r.before, r.after]),
    [
      ["昔から今へ", "今から昔へ"],
      ["呼んだ場所", "録画の始点"],
    ],
  );
  assert.deepEqual(run, before);
  assert.ok(new Game(run).offer(26).some((u) => u.id === "rewind"));
  for (const version of [1, 2]) {
    const legacy = { ...run, catalogVersion: version, upgrades: { rewind: 1 } };
    assert.equal(previewUpgrade(legacy, "rewind"), null);
    assert.equal(new Game(legacy).addUpgrade("rewind"), false);
    assert.equal(echoRecording(new Game(legacy)).playback, undefined);
  }
});
