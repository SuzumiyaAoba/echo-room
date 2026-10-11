import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun, forecastRoom } from "../src/game.js";
import { rewardPlan, weaveTheme, WEAVE_THEMES } from "../src/rewards.js";
import { UPGRADES, rank, isCamp, isElite, isBoss } from "../src/content.js";
import { freshProfile, validateProfile } from "../src/save.js";

test("織室の方向は地域ごとに巡り、休憩・守り手・他の航路に予告を付けない", () => {
  for (let seed = 0; seed < 100; seed++) {
    const run = createRun(`WEAVE-${seed}`);
    for (let act = 0; act < 3; act++) {
      const themes = [0, 1, 3, 4, 6]
        .map((room) => weaveTheme({ ...run, stage: act * 8 + room }))
        .filter(Boolean);
      assert.equal(new Set(themes.map((theme) => theme.id)).size, act ? 5 : 4);
    }
    for (let stage = 0; stage < 24; stage++) {
      const current = { ...run, stage };
      if (!stage || isCamp(stage) || isBoss(stage))
        assert.equal(weaveTheme(current), null);
      for (const route of ["rest", "salvage"])
        assert.equal(weaveTheme({ ...current, route }), null);
    }
  }
});

test("予告した織片・敵数と実際に入室した部屋が一致し、現在の旅を変えない", () => {
  for (let seed = 0; seed < 30; seed++) {
    const run = createRun(`FORECAST-${seed}`, "needle", "spool", seed % 3);
    run.upgrades = { double: seed % 3, thread: seed % 4, dash: seed % 4 };
    const original = structuredClone(run);
    for (let stage = 1; stage < 24; stage++) {
      for (const route of ["loom", "salvage", "rest"]) {
        const forecast = forecastRoom(run, stage, route);
        const actual = new Game({ ...structuredClone(run), stage, route });
        const counts = {};
        for (const enemy of actual.spawnQueue)
          counts[enemy.kind] = (counts[enemy.kind] || 0) + 1;
        assert.equal(forecast.total, actual.spawnQueue.length);
        assert.deepEqual(forecast.enemies, counts);
        assert.deepEqual(forecast.offers, actual.offer());
        assert.equal(forecast.elite, isElite(stage));
        if (forecast.promised) {
          assert.ok(actual.offer().some((u) => u.id === forecast.promised.id));
          assert.equal(forecast.promised.tag, forecast.theme.tag);
          assert.equal(actual.addUpgrade(forecast.promised.id), true);
        }
        assert.deepEqual(run, original);
      }
    }
  }
});

test("戦闘中の乱数・演出・記憶の回収で航路の織片が変わらず、保存からも再現する", () => {
  const run = createRun("PROMISE-SAVE");
  run.stage = 4;
  const preview = forecastRoom(run, run.stage, "loom");
  const g = new Game(run);
  for (let i = 0; i < 700; i++) g.rng.next();
  g.effect(80, 80, "burst", "#fff", 16);
  g.run.memory += 12;
  g.run.scrap += 200;
  g.run.hp -= 20;
  const profile = freshProfile();
  profile.run = structuredClone(g.run);
  const resumed = new Game(validateProfile(profile).run);
  assert.deepEqual(g.offer(), preview.offers);
  assert.deepEqual(resumed.offer(), preview.offers);
  assert.ok(resumed.offer().some((u) => u.id === preview.promised.id));
});

test("上限と前提を守り、選べる織片がない方向は偽の予告を出さない", () => {
  const run = createRun("EXHAUSTED-THEME");
  run.stage = 9;
  const theme = weaveTheme(run);
  for (const u of UPGRADES.filter((u) => u.tag === theme.tag))
    run.upgrades[u.id] = u.max;
  const fallback = rewardPlan(run);
  assert.equal(fallback.promised, null);
  assert.equal(fallback.offers.length, 3);
  for (const u of fallback.offers) {
    assert.notEqual(u.tag, theme.tag);
    assert.ok(rank(run, u.id) < u.max);
    assert.ok(!u.requires || rank(run, u.requires));
  }
  for (const u of UPGRADES) run.upgrades[u.id] = u.max;
  assert.deepEqual(rewardPlan(run).offers, []);
  assert.equal(rewardPlan(run).promised, null);

  // A locked triangle is not promised even after every currently usable thread is maxed.
  const locked = createRun("LOCKED-THREAD");
  for (
    let seed = 0;
    weaveTheme({ ...locked, stage: 1 })?.tag !== "光糸";
    seed++
  )
    locked.seed = `LOCKED-${seed}`;
  locked.stage = 1;
  locked.upgrades = { thread: 3, wide: 2, suture: 1, counter: 1 };
  assert.equal(rewardPlan(locked).promised, null);
  assert.ok(
    !new Game(locked).offer(UPGRADES.length).some((u) => u.id === "triangle"),
  );
  locked.upgrades.double = 1;
  assert.equal(rewardPlan(locked).promised.id, "triangle");
});

test("全五方向の強敵が予告とレア報酬を両立し、同じ織片を重複提示しない", () => {
  const found = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const run = createRun(`ELITE-WEAVE-${seed}`);
    run.stage = 6;
    const plan = rewardPlan(run);
    found.add(plan.theme.id);
    assert.equal(plan.offers.length, 3);
    assert.equal(new Set(plan.offers.map((u) => u.id)).size, 3);
    assert.ok(plan.offers.some((u) => u.rarity !== "common"));
    assert.ok(plan.offers.includes(plan.promised));
    assert.equal(plan.promised.tag, plan.theme.tag);
    const reduced = rewardPlan(run, 1);
    assert.ok(reduced.offers[0].rarity !== "common");
    assert.ok(!reduced.promised || reduced.offers.includes(reduced.promised));
  }
  assert.equal(found.size, WEAVE_THEMES.length);
});
