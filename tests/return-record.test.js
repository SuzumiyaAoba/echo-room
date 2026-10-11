import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Game, createRun } from "../src/game.js";
import { UPGRADES, WEAPONS, RELICS } from "../src/content.js";
import {
  makeReturnRecord,
  normalizeReturnRecord,
  returnReadout,
} from "../src/return-record.js";
import {
  freshProfile,
  validateProfile,
  exportProfile,
  prepareImport,
  saveProfile,
  loadState,
  saveImportedProfile,
  loadImportUndo,
} from "../src/save.js";
import { validateProfile as beforeValidate } from "./fixtures/return-before/save.js";

const earned = JSON.parse(
  readFileSync(new URL("./fixtures/return-run.json", import.meta.url)),
).run;
const storage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
};

test("実戦で得た13種18段と実際の能力・回数を、再開用の状態から切り離して記録する", () => {
  const before = structuredClone(earned),
    r = makeReturnRecord(earned, true, 133),
    view = returnReadout(r);
  assert.equal(r.outcome, "victory");
  assert.equal(r.memory, 133);
  assert.equal(view.fragments.length, 13);
  assert.equal(view.levels, 18);
  assert.deepEqual(r.light, {
    capacity: 2,
    chargeSeconds: 7 / 1.5,
    lifeSeconds: 5.8,
    playback: "reverse",
  });
  for (const k of [
    "kills",
    "time",
    "damageTaken",
    "echoesCast",
    "threadCuts",
    "threadReturns",
    "needleStitches",
  ])
    assert.equal(r.run[k], earned[k]);
  assert.equal(r.run.upgrades.rewind, 1);
  assert.equal(r.run.hp, undefined);
  assert.equal(r.run.checkpoint, undefined);
  assert.equal(r.run.rng, undefined);
  assert.equal(r.run.history, undefined);
  assert.ok(JSON.stringify(r).length < 2048);
  r.run.upgrades.rewind = 0;
  assert.deepEqual(earned, before);
});

test("候補版1・2・3の全取得を列挙し、重なりと装備・お守り・難度を読み分ける", () => {
  for (const version of [1, 2, 3])
    for (const weapon of WEAPONS)
      for (const relic of RELICS) {
        const run = createRun("RETURN-ALL", weapon.id, relic.id, 2);
        run.catalogVersion = version;
        run.upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
        const record = makeReturnRecord(run, false, 5),
          view = returnReadout(record);
        assert.equal(
          view.fragments.length,
          version === 3 ? 26 : version === 2 ? 25 : 24,
        );
        assert.equal(view.weapon.id, weapon.id);
        assert.equal(view.relic.id, relic.id);
        assert.equal(view.difficulty, "深淵");
        assert.equal(
          view.levels,
          view.fragments.reduce((n, u) => n + u.max, 0),
        );
        assert.equal(
          record.light.playback,
          version === 3 ? "reverse" : "forward",
        );
        assert.ok(view.fragments.every((u) => u.level === u.max));
      }
});

test("記録を繰り返し読んでもゲーム・録画・戦闘乱数と元の記録を変更しない", () => {
  const game = new Game(createRun("RETURN-READONLY"));
  for (let i = 0; i < 120; i++)
    game.update(1 / 60, { mx: 1, fire: true, angle: -1, echo: i === 50 });
  const before = JSON.stringify(game);
  for (let i = 0; i < 100; i++) {
    const record = makeReturnRecord(game.run, false, 5),
      copy = JSON.stringify(record);
    const view = returnReadout(record);
    view.light.lifeSeconds = 999;
    if (view.fragments[0]) view.fragments[0].level = 999;
    assert.equal(JSON.stringify(record), copy);
  }
  assert.equal(JSON.stringify(game), before);
});

test("帰還した時の能力値を再計算せず保存し、古い記録の解釈を変えない", () => {
  const r = makeReturnRecord(earned, true, 133);
  r.light.chargeSeconds = 6.125;
  r.light.lifeSeconds = 9.75;
  const p = { ...freshProfile(), lastReturn: r };
  const restored = prepareImport(exportProfile(p)).profile;
  assert.deepEqual(restored.lastReturn, r);
  assert.deepEqual(returnReadout(restored.lastReturn).light, r.light);
  assert.equal(restored.run, null);
});

test("破損した旅の記録だけを無視し、途中の航路と他の記憶を保つ", () => {
  const p = freshProfile();
  p.memory = 44;
  p.run = createRun("RETURN-ONGOING");
  const r = makeReturnRecord(earned, true, 133);
  const invalid = [
    undefined,
    null,
    {},
    { ...r, version: 2 },
    { ...r, outcome: "other" },
    { ...r, run: { ...r.run, stage: 0 } },
    { ...r, run: { ...r.run, weapon: "unknown" } },
    { ...r, run: { ...r.run, kills: -1 } },
    { ...r, run: { ...r.run, time: Infinity } },
    { ...r, light: { ...r.light, capacity: 4 } },
    { ...r, light: { ...r.light, chargeSeconds: 0 } },
    { ...r, light: { ...r.light, playback: "forward" } },
  ];
  const expected = validateProfile(p);
  for (const bad of invalid) {
    assert.equal(normalizeReturnRecord(bad), null);
    assert.deepEqual(validateProfile({ ...p, lastReturn: bad }), expected);
  }
});

test("記録の未知の状態を捨て、取得上限と旧候補を保持する", () => {
  const r = makeReturnRecord(earned, true, 133);
  r.run.actor = { hp: 9999 };
  r.run.history = [{ x: 1, y: 2 }];
  r.run.upgrades.damage = 99;
  r.run.upgrades.unknown = 999;
  r.light.arbitrary = "unused";
  r.extra = true;
  const clean = normalizeReturnRecord(r);
  assert.equal(
    clean.run.upgrades.damage,
    UPGRADES.find((u) => u.id === "damage").max,
  );
  assert.equal(clean.run.upgrades.unknown, undefined);
  assert.equal(clean.run.actor, undefined);
  assert.equal(clean.run.history, undefined);
  assert.equal(clean.light.arbitrary, undefined);
  assert.equal(clean.extra, undefined);
});

test("旅の記録がない旧保存432条件は追加前と同じプロフィールへ移行する", () => {
  for (const version of [1, 2, 3])
    for (const weapon of WEAPONS)
      for (const relic of RELICS)
        for (const stage of [0, 1, 2, 5, 7, 10, 16, 23])
          for (const checkpoint of ["entry", "cleared"]) {
            const p = freshProfile();
            p.run = createRun(`RETURN-OLD-${version}`, weapon.id, relic.id);
            // These fixtures represent old saves, before Bell recovery existed.
            delete p.run.encounterVersion;
            delete p.run.chargeVersion;
            delete p.run.bellVersion;
            delete p.run.bellCuts;
            delete p.run.bellRecovered;
            Object.assign(p.run, {
              catalogVersion: version,
              stage,
              checkpoint,
              scrap: 77,
            });
            assert.deepEqual(validateProfile(p), beforeValidate(p));
            assert.equal(
              Object.hasOwn(validateProfile(p), "lastReturn"),
              false,
            );
          }
});

test("通常保存・実ファイル・取り込み前への復帰に直近の旅を保持する", () => {
  const s = storage(),
    p = freshProfile();
  p.lastReturn = makeReturnRecord(earned, true, 133);
  assert.equal(saveProfile(p, s), true);
  assert.deepEqual(loadState(s).profile.lastReturn, p.lastReturn);
  const next = freshProfile();
  next.lastReturn = makeReturnRecord(createRun("RETURN-LOSS"), false, 5);
  saveImportedProfile(next, p, s);
  assert.deepEqual(loadState(s).profile.lastReturn, next.lastReturn);
  assert.deepEqual(loadImportUndo(s).lastReturn, p.lastReturn);
  assert.deepEqual(
    prepareImport(exportProfile(loadImportUndo(s))).profile.lastReturn,
    p.lastReturn,
  );
});
