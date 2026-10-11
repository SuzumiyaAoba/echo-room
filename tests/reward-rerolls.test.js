import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun, forecastRoom } from "../src/game.js";
import { rewardPlan, rewardRerollState } from "../src/rewards.js";
import { UPGRADES, isBoss, isElite } from "../src/content.js";
import {
  freshProfile,
  validateProfile,
  exportProfile,
  prepareImport,
} from "../src/save.js";
import { STORIES } from "../src/story.js";

test("織り直しでも航路の約束・レア報酬・上限と前提を守る", () => {
  for (let seed = 0; seed < 30; seed++) {
    for (let stage = 0; stage < 23; stage++) {
      for (const route of ["loom", "rest", "salvage"]) {
        const run = {
          ...createRun(`REROLL-${seed}`),
          stage,
          route,
          upgrades: { double: seed % 3, thread: seed % 4, dash: seed % 4 },
        };
        const first = rewardPlan(run);
        let previous = first.offers;
        for (let rewardRoll = 1; rewardRoll <= 2; rewardRoll++) {
          const plan = rewardPlan({ ...run, rewardRoll });
          assert.equal(plan.promised?.id, first.promised?.id);
          assert.equal(
            new Set(plan.offers.map((u) => u.id)).size,
            plan.offers.length,
          );
          assert.equal(plan.offers.length, 3);
          if (plan.promised) assert.ok(plan.offers.includes(plan.promised));
          if (isBoss(stage) || isElite(stage))
            assert.ok(plan.offers.some((u) => u.rarity !== "common"));
          for (const u of plan.offers) {
            assert.ok((run.upgrades[u.id] || 0) < u.max);
            assert.ok(!u.requires || run.upgrades[u.requires]);
            assert.ok(u.rarity !== "legendary" || stage >= 6);
          }
          for (const u of plan.offers)
            if (u !== plan.promised) assert.ok(!previous.includes(u));
          previous = plan.offers;
        }
      }
    }
  }
});

test("歯車12と20を一度ずつ払い、戦闘中・不足・三回目では払わない", () => {
  const g = new Game(createRun("PAID-REROLL"));
  g.run.scrap = 100;
  const rng = g.rng.state,
    hp = g.run.hp,
    upgrades = structuredClone(g.run.upgrades);
  assert.equal(g.rerollReward(), false);
  assert.equal(g.run.scrap, 100);
  g.mode = "reward";
  assert.equal(g.rerollReward(), true);
  assert.equal(g.run.scrap, 88);
  assert.equal(g.run.rewardRoll, 1);
  g.run.scrap = 19;
  const before = JSON.stringify(g.run);
  assert.equal(g.rerollReward(), false);
  assert.equal(JSON.stringify(g.run), before);
  g.run.scrap = 88;
  assert.equal(g.rerollReward(), true);
  assert.equal(g.run.scrap, 68);
  assert.equal(g.run.rewardRoll, 2);
  assert.equal(g.rerollReward(), false);
  assert.equal(g.run.scrap, 68);
  assert.equal(g.rng.state, rng);
  assert.equal(g.run.hp, hp);
  assert.deepEqual(g.run.upgrades, upgrades);
});

test("候補の枯渇では歯車を取らず、少ないレア候補でも強敵の報酬を保つ", () => {
  const run = createRun("SCARCE-REROLL");
  run.stage = 6;
  run.route = "salvage";
  run.scrap = 100;
  for (const u of UPGRADES) run.upgrades[u.id] = u.max;
  for (const id of ["damage", "rapid", "pierce", "health"])
    run.upgrades[id] = 0;
  for (let rewardRoll = 0; rewardRoll < 3; rewardRoll++) {
    const plan = rewardPlan({ ...run, rewardRoll });
    assert.ok(plan.offers.some((u) => u.id === "pierce"));
    assert.equal(plan.offers.length, 3);
  }
  run.upgrades.health = 3;
  const g = new Game(run);
  g.mode = "reward";
  assert.equal(rewardRerollState(run).reason, "exhausted");
  assert.equal(g.rerollReward(), false);
  assert.equal(g.run.scrap, 100);
  run.upgrades.damage = 4;
  run.upgrades.rapid = 3;
  run.upgrades.pierce = 2;
  assert.deepEqual(g.offer(), []);
  assert.equal(g.rerollReward(), false);
});

test("選択途中の候補と支払いを移行・再開し、次の航路には回数を持ち越さない", () => {
  const p = freshProfile();
  p.run = createRun("REROLL-SAVE");
  Object.assign(p.run, {
    stage: 1,
    checkpoint: "reward",
    rewardRoll: 2,
    scrap: 68,
    hp: 73,
    kills: 7,
  });
  const offers = rewardPlan(p.run).offers.map((u) => u.id);
  const restored = prepareImport(exportProfile(p)).profile.run;
  assert.equal(restored.checkpoint, "reward");
  assert.equal(restored.rewardRoll, 2);
  assert.equal(restored.scrap, 68);
  assert.equal(restored.hp, 73);
  assert.equal(restored.kills, 7);
  assert.deepEqual(
    rewardPlan(restored).offers.map((u) => u.id),
    offers,
  );
  const next = forecastRoom(restored, 3, "loom");
  const expected = rewardPlan({ ...restored, stage: 3, rewardRoll: 0 });
  assert.deepEqual(next.offers, expected.offers);
  assert.equal(restored.rewardRoll, 2);
  delete p.run.rewardRoll;
  p.run.checkpoint = "entry";
  assert.equal(validateProfile(p).run.rewardRoll, 0);
});

test("物語の織片だけを選択途中として再開し、休息・最終部屋の不正な待ちは除く", () => {
  const p = freshProfile();
  p.run = createRun("STORY-REROLL");
  const story = STORIES.find(
    (s) => s.act === 0 && s.choices.some((c) => c.offer),
  );
  const choice = story.choices.find((c) => c.offer);
  Object.assign(p.run, {
    stage: 2,
    checkpoint: "reward",
    rewardRoll: 1,
    journal: [{ id: story.id, choice: choice.id, stage: 2 }],
  });
  assert.equal(validateProfile(p).run.checkpoint, "reward");
  assert.equal(validateProfile(p).run.rewardRoll, 1);
  p.run.route = "rest";
  assert.equal(validateProfile(p).run.checkpoint, "entry");
  assert.equal(validateProfile(p).run.rewardRoll, 0);
  p.run.route = "loom";
  p.run.journal = [];
  assert.equal(validateProfile(p).run.checkpoint, "entry");
  p.run.stage = 23;
  assert.equal(validateProfile(p).run.checkpoint, "entry");
  p.run.stage = 1;
  p.run.rewardRoll = 999;
  assert.equal(validateProfile(p).run.rewardRoll, 2);
});
