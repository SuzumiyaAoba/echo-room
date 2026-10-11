import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { UPGRADES } from "../src/content.js";
import { freshProfile, validateProfile } from "../src/save.js";
import {
  STORIES,
  CITY_PROJECTS,
  CITY_MEMORIES,
  STORY_KEYS,
  selectStory,
  canChooseStory,
  applyStoryChoice,
  cityProgress,
  startingFragments,
  settleCity,
} from "../src/story.js";

function storyGame(story) {
  const run = createRun("STORY-TEST");
  run.stage = story.act * 8 + 2;
  run.hp = 50;
  run.scrap = 100;
  return new Game(run);
}

test("物語は地域に属し、同じ旅では重複せず、入口からの再開は同じ場面になる", () => {
  const covered = new Set();
  for (let act = 0; act < 3; act++) {
    for (const roll of [0.05, 0.4, 0.9]) {
      const run = createRun("STORY-SEED");
      run.stage = act * 8 + 2;
      const first = selectStory(run, roll);
      assert.equal(first.act, act);
      covered.add(first.id);
      run.journal.push({
        id: first.id,
        choice: first.choices[0].id,
        stage: run.stage,
      });
      run.stage = act * 8 + 5;
      const second = selectStory(run, roll);
      assert.notEqual(second.id, first.id);
      assert.equal(second.act, act);
      assert.equal(
        new Game(structuredClone(run)).event.id,
        new Game(structuredClone(run)).event.id,
      );
    }
  }
  assert.equal(covered.size, 9);
  assert.equal(selectStory(createRun("NO-CAMP")), null);
});

test("全27の選択が費用を一度だけ支払い、効果と選択の記録を残す", () => {
  let choices = 0;
  for (const story of STORIES)
    for (let index = 0; index < story.choices.length; index++) {
      const game = storyGame(story),
        choice = story.choices[index];
      const applied = applyStoryChoice(game, story, index);
      assert.equal(applied, choice);
      assert.equal(
        game.run.scrap,
        100 + (choice.scrap || 0) - (choice.costScrap || 0),
      );
      assert.equal(game.run.memory, choice.memory || 0);
      assert.equal(game.run.maxHp, 100 + (choice.maxHp || 0));
      assert.equal(
        game.run.hp,
        Math.min(
          game.run.maxHp,
          50 - (choice.costHp || 0) + (choice.heal || 0),
        ),
      );
      if (choice.upgrade) assert.equal(game.run.upgrades[choice.upgrade], 1);
      assert.deepEqual(game.run.journal, [
        { id: story.id, choice: choice.id, stage: game.run.stage },
      ]);
      const before = structuredClone(game.run);
      assert.equal(applyStoryChoice(game, story, index), null);
      assert.deepEqual(game.run, before);
      choices++;
    }
  assert.equal(choices, 27);
});

test("費用が足りない選択は体力・歯車・記憶・日誌を変更しない", () => {
  for (const story of STORIES)
    for (const [index, choice] of story.choices.entries()) {
      if (!choice.costHp && !choice.costScrap) continue;
      const game = storyGame(story);
      if (choice.costHp) game.run.hp = choice.costHp;
      if (choice.costScrap) game.run.scrap = choice.costScrap - 1;
      const before = structuredClone(game.run);
      assert.equal(canChooseStory(game.run, choice), false);
      assert.equal(applyStoryChoice(game, story, index), null);
      assert.deepEqual(game.run, before);
    }
});

test("別の地域・戦闘中・未知の選択を適用せず、上限を越える強化を選べない", () => {
  const game = storyGame(STORIES[0]);
  assert.equal(
    applyStoryChoice(
      game,
      STORIES.find((s) => s.act === 1),
      0,
    ),
    null,
  );
  assert.equal(applyStoryChoice(game, STORIES[0], 99), null);
  game.run.stage = 0;
  assert.equal(applyStoryChoice(game, STORIES[0], 0), null);
  for (const story of STORIES)
    for (const choice of story.choices) {
      const g = storyGame(story);
      if (choice.maxHp) {
        g.run.maxHp = 240;
        assert.equal(canChooseStory(g.run, choice), false);
      }
      if (choice.upgrade) {
        g.run.upgrades[choice.upgrade] = UPGRADES.find(
          (u) => u.id === choice.upgrade,
        ).max;
        assert.equal(canChooseStory(g.run, choice), false);
      }
    }
});

test("倒れても街の記憶と後日談を持ち帰り、同じ記憶は二度数えない", () => {
  const profile = freshProfile(),
    run = createRun("RETURN");
  run.bosses = ["ferryman"];
  run.beacons = [3];
  run.repairs = [1];
  run.journal = [{ id: "bottle", choice: "deliver", stage: 2 }];
  const result = settleCity(profile, run, false);
  assert.equal(result.ending, null);
  assert.equal(result.added.length, 4);
  assert.deepEqual(profile.stories, ["bottle:deliver"]);
  assert.equal(cityProgress(profile, CITY_PROJECTS[0]).count, 4);
  const again = settleCity(profile, run, false);
  assert.equal(again.added.length, 0);
  assert.equal(profile.remembered.length, 4);
  assert.equal(cityProgress(profile, CITY_PROJECTS[1]).count, 0);
  assert.deepEqual(profile.endings, []);
});

test("街の修復は五つの固有記憶で一度だけ完了し、対応する織片を解放する", () => {
  for (const project of CITY_PROJECTS) {
    const profile = freshProfile();
    const memories = CITY_MEMORIES.filter((m) => m.project === project.id);
    profile.remembered = memories.slice(0, 4).map((m) => m.key);
    assert.deepEqual(startingFragments(profile), []);
    const run = createRun("RESTORE");
    run.repairs = [project.act * 8 + 4];
    const result = settleCity(profile, run, false);
    assert.deepEqual(
      result.unlocked.map((p) => p.id),
      [project.id],
    );
    assert.deepEqual(startingFragments(profile), [project.fragment]);
    assert.equal(cityProgress(profile, project).count, 5);
    assert.equal(settleCity(profile, run, false).unlocked.length, 0);
  }
});

test("三地域の修復と一度の旅の灯りが揃うと別の結末になり、勝利なしでは解放しない", () => {
  const run = createRun("CHORUS");
  run.bosses = ["ferryman", "gardener", "heart"];
  run.beacons = [3, 4, 11, 12, 19, 20];
  run.repairs = [1, 4, 9, 12, 17, 20];
  const profile = freshProfile();
  assert.equal(settleCity(profile, run, false).ending, null);
  assert.equal(
    settleCity(profile, { ...run, beacons: [3, 11] }, true).ending,
    "dawn",
  );
  assert.equal(settleCity(profile, run, true).ending, "chorus");
  assert.deepEqual(profile.endings, ["dawn", "chorus"]);
  assert.equal(settleCity(profile, run, true).added.length, 0);
  const newCity = freshProfile();
  assert.equal(
    settleCity(newCity, { ...run, repairs: [] }, true).ending,
    "dawn",
  );
});

test("古い保存を引き継ぎ、破損した街・手紙・日誌の項目だけを除外する", () => {
  const old = {
    version: 1,
    memory: 50,
    victories: 1,
    lore: ["start", "ferryman", "gardener", "heart"],
  };
  const migrated = validateProfile(old);
  assert.equal(migrated.memory, 50);
  assert.deepEqual(migrated.remembered, [
    "keeper:ferryman",
    "keeper:gardener",
    "keeper:heart",
  ]);
  assert.deepEqual(migrated.endings, ["dawn"]);
  const raw = freshProfile();
  raw.remembered = ["beacon:3", "beacon:3", "no-such-place"];
  raw.stories = ["bottle:deliver", "bottle:deliver", "bottle:no-such-choice"];
  raw.endings = ["chorus", "unknown"];
  raw.run = createRun("SAVE-STORY");
  raw.run.stage = 5;
  raw.run.journal = [
    { id: "bottle", choice: "deliver", stage: 2 },
    { id: "bottle", choice: "receive", stage: 5 },
    { id: "garden", choice: "plant", stage: 5 },
    { id: "ticket", choice: "repair", stage: 99 },
    { id: "ticket", choice: "repair", stage: 5 },
  ];
  raw.run.beacons = [0, 3, 3, 20];
  raw.run.repairs = [1, 1, 17];
  const restored = validateProfile(raw);
  assert.deepEqual(restored.remembered, ["beacon:3"]);
  assert.deepEqual(restored.stories, ["bottle:deliver"]);
  assert.deepEqual(restored.endings, ["chorus"]);
  assert.deepEqual(restored.run.journal, [
    { id: "bottle", choice: "deliver", stage: 2 },
    { id: "ticket", choice: "repair", stage: 5 },
  ]);
  assert.deepEqual(restored.run.beacons, [3]);
  assert.deepEqual(restored.run.repairs, [1]);
  assert.equal(STORY_KEYS.length, 27);
});
