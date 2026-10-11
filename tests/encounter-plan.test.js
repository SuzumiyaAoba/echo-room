import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun, forecastRoom } from "../src/game.js";
import { encounterPlan, REGIONAL_ENCOUNTERS } from "../src/encounter-plan.js";
import { ENEMIES, isBoss, isCamp, actIndex } from "../src/content.js";
import {
  freshProfile,
  validateProfile,
  prepareImport,
  exportProfile,
} from "../src/save.js";
import {
  makeReturnRecord,
  normalizeReturnRecord,
} from "../src/return-record.js";
import {
  Game as Before,
  createRun as beforeRun,
} from "./fixtures/tactics-before/game.js";
import { validateProfile as beforeValidate } from "./fixtures/tactics-before/save.js";

test("三地域の九構成が各航路で分かれ、最初の部屋・休息・守り手と旧旅は元の戦場を保つ", () => {
  assert.equal(new Set(REGIONAL_ENCOUNTERS.flat().map((p) => p.id)).size, 9);
  for (let seed = 0; seed < 40; seed++)
    for (let stage = 0; stage < 24; stage++) {
      const run = { ...createRun(`TACTICS-${seed}`), stage };
      const old = { ...run };
      delete old.encounterVersion;
      assert.equal(encounterPlan(old), null);
      const plans = ["loom", "salvage", "rest"].map((route) =>
        encounterPlan({ ...run, route }),
      );
      if (!stage || isCamp(stage) || isBoss(stage)) {
        assert.ok(plans.every((p) => p === null));
      } else {
        assert.equal(new Set(plans.map((p) => p.id)).size, 3);
        assert.ok(
          plans.every((p) => REGIONAL_ENCOUNTERS[actIndex(stage)].includes(p)),
        );
      }
    }
});

test("実際の出現と航路の構成・敵数・位置が一致し、三武器・三難度の予告が旅を変えない", () => {
  const found = new Set();
  for (const weapon of ["needle", "scatter", "prism"])
    for (let difficulty = 0; difficulty < 3; difficulty++)
      for (let stage = 1; stage < 24; stage++)
        for (const route of ["loom", "salvage", "rest"]) {
          const run = {
            ...createRun("TACTIC-FORECAST", weapon, "spool", difficulty),
            stage,
            route,
          };
          const before = JSON.stringify(run);
          const forecast = forecastRoom(run, stage, route);
          const game = new Game(structuredClone(run));
          const plan = encounterPlan(run);
          const counts = {};
          for (const [i, enemy] of game.spawnQueue.entries()) {
            counts[enemy.kind] = (counts[enemy.kind] || 0) + 1;
            if (plan) {
              assert.equal(enemy.kind, plan.pattern[i % plan.pattern.length]);
              const radius = ENEMIES[enemy.kind].radius + (enemy.elite ? 2 : 0);
              assert.equal(game.solid(enemy.x, enemy.y, radius), false);
              assert.ok(
                Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) >
                  radius + 20,
              );
            }
          }
          assert.deepEqual(forecast.enemies, counts);
          assert.equal(forecast.total, game.spawnQueue.length);
          assert.deepEqual(forecast.offers, game.offer());
          if (plan) {
            found.add(plan.id);
            assert.deepEqual(forecast.encounter, game.encounter);
            assert.equal(game.encounter.id, plan.id);
          } else assert.equal(forecast.encounter, undefined);
          assert.equal(JSON.stringify(run), before);
        }
  assert.equal(found.size, 9);
});

test("旧旅の全24部屋・三航路・三難度の出現と全Game JSONは改修前と一致する", () => {
  for (let stage = 0; stage < 24; stage++)
    for (const route of ["loom", "salvage", "rest"])
      for (let difficulty = 0; difficulty < 3; difficulty++) {
        const run = {
          ...beforeRun("TACTIC-OLD", "needle", "bell", difficulty),
          stage,
          route,
        };
        const old = new Before(structuredClone(run));
        const current = new Game(structuredClone(run));
        assert.equal(JSON.stringify(current), JSON.stringify(old));
      }
});

test("新構成の保存・実ファイル・帰還記録を保持し、版なしと未知の版は旧旅を変えない", () => {
  for (const version of [undefined, 0, 1, 2, "1"])
    for (const stage of [1, 9, 17, 23]) {
      const p = freshProfile();
      p.run = { ...beforeRun("TACTIC-SAVE"), stage };
      if (version !== undefined) p.run.encounterVersion = version;
      const saved = validateProfile(p);
      assert.equal(saved.run.encounterVersion, version === 1 ? 1 : undefined);
      if (version !== 1) assert.deepEqual(saved, beforeValidate(p));
      assert.deepEqual(prepareImport(exportProfile(saved)).profile, saved);
      const entry = new Game(saved.run);
      assert.deepEqual(
        new Game(validateProfile(saved).run).spawnQueue,
        entry.spawnQueue,
      );
      const record = makeReturnRecord(saved.run, stage === 23, 5);
      assert.equal(record.run.encounterVersion, version === 1 ? 1 : undefined);
      assert.deepEqual(normalizeReturnRecord(record), record);
    }
});
