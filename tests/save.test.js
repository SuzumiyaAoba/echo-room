import test from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../src/game.js";
import {
  freshProfile,
  loadState,
  saveProfile,
  exportProfile,
  prepareImport,
  saveImportedProfile,
  loadImportUndo,
  SAVE_KEY,
  RECOVERY_KEY,
  IMPORT_UNDO_KEY,
  MAX_BACKUP_BYTES,
  SaveSession,
} from "../src/save.js";

const memoryStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
};
const progress = () => {
  const p = freshProfile();
  Object.assign(p, {
    memory: 53,
    attempts: 8,
    victories: 1,
    best: 24,
    totalKills: 211,
  });
  p.unlocked.push("scatter", "bell");
  p.lore.push("ferryman");
  p.remembered = ["keeper:ferryman", "beacon:3"];
  p.endings = ["dawn"];
  p.run = createRun("A-RECORD-OF-LIGHT", "scatter", "bell", 1);
  Object.assign(p.run, { stage: 5, checkpoint: "cleared", hp: 57, scrap: 72 });
  p.run.beacons = [3];
  p.run.repairs = [1];
  p.run.journal = [{ id: "bottle", choice: "deliver", stage: 2 }];
  p.run.upgrades = { double: 1, wide: 2 };
  return p;
};

test("書き出しと読み込みで記憶・装備・途中の航路・設定を持ち運べる", () => {
  const p = progress();
  p.settings.music = 0;
  p.settings.autoAim = true;
  const before = structuredClone(p);
  const text = exportProfile(p, new Date("2026-10-08T00:00:00Z"));
  const parsed = prepareImport(text);
  assert.equal(parsed.createdAt, "2026-10-08T00:00:00.000Z");
  assert.equal(parsed.profile.memory, 53);
  assert.deepEqual(parsed.profile.remembered, p.remembered);
  assert.deepEqual(parsed.profile.unlocked, p.unlocked);
  assert.equal(parsed.profile.run.seed, p.run.seed);
  assert.equal(parsed.profile.run.checkpoint, "cleared");
  assert.equal(parsed.profile.run.upgrades.wide, 2);
  assert.deepEqual(parsed.profile.run.journal, p.run.journal);
  assert.equal(parsed.profile.settings.music, 0);
  assert.equal(parsed.profile.settings.autoAim, true);
  assert.deepEqual(p, before);
});

test("旧形式の記録を移行し、未知の記録と織片を除外する", () => {
  const p = progress();
  delete p.remembered;
  delete p.endings;
  p.unlocked.push("unknown");
  p.lore.push("unknown");
  p.run.upgrades.unknown = 99;
  const parsed = prepareImport(JSON.stringify(p));
  assert.equal(parsed.createdAt, null);
  assert.deepEqual(parsed.profile.remembered, ["keeper:ferryman"]);
  assert.deepEqual(parsed.profile.endings, ["dawn"]);
  assert.equal(parsed.profile.unlocked.includes("unknown"), false);
  assert.equal(parsed.profile.run.upgrades.unknown, undefined);
});

test("壊れた形式・異なるバージョン・不正な航路・過大なファイルを拒否する", () => {
  for (const text of [
    "{broken",
    "null",
    "[]",
    "{}",
    '{"version":1}',
    JSON.stringify({ ...progress(), version: 2 }),
    JSON.stringify({
      format: "echo-loom.backup",
      version: 2,
      profile: progress(),
    }),
    JSON.stringify({ ...progress(), run: { ...progress().run, stage: 24 } }),
    " ".repeat(MAX_BACKUP_BYTES + 1),
  ])
    assert.throws(() => prepareImport(text));
});

test("主記録が壊れたときだけ直前の正常な保存から復元する", () => {
  const storage = memoryStorage(),
    p = progress();
  assert.equal(loadState(storage).source, "fresh");
  assert.equal(saveProfile(p, storage), true);
  p.memory = 72;
  assert.equal(saveProfile(p, storage), true);
  assert.equal(loadState(storage).source, "main");
  assert.equal(loadState(storage).profile.memory, 72);
  storage.data.set(SAVE_KEY, "truncated{");
  const restored = loadState(storage);
  assert.equal(restored.source, "recovery");
  assert.equal(restored.profile.memory, 53);
  assert.equal(restored.profile.run.checkpoint, "cleared");
  storage.data.set(RECOVERY_KEY, "truncated{");
  assert.equal(loadState(storage).source, "damaged");
  assert.deepEqual(loadState(storage).profile, freshProfile());
});

test("取り込み前の記録は通常の保存を繰り返しても復帰用に残る", () => {
  const storage = memoryStorage(),
    current = progress(),
    next = freshProfile();
  next.memory = 10;
  const result = saveImportedProfile(next, current, storage);
  assert.deepEqual(result, { saved: true, backupSaved: true });
  next.memory = 15;
  saveProfile(next, storage);
  next.memory = 19;
  saveProfile(next, storage);
  assert.equal(loadImportUndo(storage).memory, 53);
  assert.equal(loadImportUndo(storage).run.seed, current.run.seed);
  assert.equal(loadState(storage).profile.memory, 19);
  const undo = loadImportUndo(storage);
  saveImportedProfile(undo, next, storage);
  assert.equal(loadState(storage).profile.memory, 53);
  assert.equal(loadImportUndo(storage).memory, 19);
});

test("予備記録を書けなくても主記録を保存し、保存不可でも書き出せる", () => {
  const storage = memoryStorage(),
    p = progress();
  storage.setItem = (key, value) => {
    if ([RECOVERY_KEY, IMPORT_UNDO_KEY].includes(key)) throw Error("full");
    storage.data.set(key, value);
  };
  assert.equal(saveProfile(p, storage), true);
  assert.equal(loadState(storage).profile.memory, 53);
  assert.deepEqual(saveImportedProfile(freshProfile(), p, storage), {
    saved: true,
    backupSaved: false,
  });
  const unavailable = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("denied");
    },
  };
  assert.equal(loadState(unavailable).source, "unavailable");
  assert.equal(saveProfile(p, unavailable), false);
  assert.deepEqual(saveImportedProfile(p, freshProfile(), unavailable), {
    saved: false,
    backupSaved: false,
  });
  assert.equal(prepareImport(exportProfile(p)).profile.memory, 53);
});

test("古いタブの保存と取り込みは、別タブの新しい記録を上書きしない", () => {
  const storage = memoryStorage(),
    first = new SaveSession(storage),
    stale = new SaveSession(storage);
  const p = progress();
  assert.deepEqual(first.save(p), { saved: true, conflict: false });
  assert.equal(stale.changed(), true);
  assert.deepEqual(stale.save(freshProfile()), {
    saved: false,
    conflict: true,
  });
  assert.deepEqual(stale.replace(freshProfile(), freshProfile()), {
    saved: false,
    conflict: true,
  });
  assert.equal(loadImportUndo(storage), null);
  assert.equal(loadState(storage).profile.memory, 53);
  assert.equal(stale.accept().profile.memory, 53);
  assert.equal(stale.changed(), false);
  p.memory = 72;
  assert.deepEqual(stale.save(p), { saved: true, conflict: false });
  assert.equal(first.changed(), true);
  assert.deepEqual(first.overwrite(first.state.profile), {
    saved: true,
    conflict: false,
  });
  assert.equal(loadState(storage).profile.memory, 0);
  assert.equal(loadState(storage).profile.run, null);
});

test("保存の競合監視は、破損からの復元と保存領域の失敗を妨げない", () => {
  const storage = memoryStorage();
  storage.data.set(SAVE_KEY, "{broken");
  storage.data.set(RECOVERY_KEY, JSON.stringify(progress()));
  const session = new SaveSession(storage);
  assert.equal(session.state.source, "recovery");
  assert.deepEqual(session.save(session.state.profile), {
    saved: true,
    conflict: false,
  });
  assert.equal(loadState(storage).source, "main");
  const unavailable = new SaveSession({
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  });
  assert.equal(unavailable.changed(), false);
  assert.deepEqual(unavailable.save(progress()), {
    saved: false,
    conflict: false,
  });
});
