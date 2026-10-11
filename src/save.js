import {
  UPGRADES,
  CATALOG_VERSION,
  catalogUpgrades,
  WEAPONS,
  RELICS,
  ROOM_COUNT,
  roomFeature,
  isCamp,
  isBoss,
  isElite,
  actIndex,
  roomIndex,
  LORE,
} from "./content.js";
import { CITY_MEMORIES, STORIES, STORY_KEYS, CITY_PROJECTS } from "./story.js";
import { REWARD_REROLL_LIMIT } from "./rewards.js";
import { validTraderPurchases } from "./trader.js";
import { normalizeBindings, normalizeKeyLabels } from "./keybindings.js";
import { ROOM_LAYOUT_VERSION } from "./room-layouts.js";
import { normalizeReturnRecord } from "./return-record.js";
export const SAVE_KEY = "echo-loom.save.v1";
export const RECOVERY_KEY = "echo-loom.recovery.v1";
export const IMPORT_UNDO_KEY = "echo-loom.import-undo.v1";
export const MAX_BACKUP_BYTES = 256 * 1024;
const BACKUP_FORMAT = "echo-loom.backup";
export function freshProfile() {
  return {
    version: 1,
    memory: 0,
    attempts: 0,
    victories: 0,
    best: 0,
    totalKills: 0,
    unlocked: ["needle", "spool"],
    lore: ["start"],
    seen: [],
    remembered: [],
    stories: [],
    endings: [],
    settings: {
      music: 0.35,
      effects: 0.6,
      shake: true,
      flashes: true,
      autoAim: false,
    },
    run: null,
  };
}
export function validateProfile(raw) {
  const base = freshProfile();
  if (!raw || raw.version !== 1) return base;
  for (const key of ["memory", "attempts", "victories", "best", "totalKills"])
    base[key] = Number.isFinite(raw[key])
      ? Math.max(0, Math.floor(raw[key]))
      : 0;
  const allowed = {
    unlocked: [...WEAPONS, ...RELICS].map((item) => item.id),
    lore: LORE.map((item) => item.unlock),
    seen: UPGRADES.map((item) => item.id),
    remembered: CITY_MEMORIES.map((item) => item.key),
    stories: STORY_KEYS,
    endings: ["dawn", "chorus"],
  };
  for (const key of Object.keys(allowed))
    if (Array.isArray(raw[key]))
      base[key] = [
        ...new Set([
          ...base[key],
          ...raw[key].filter((x) => allowed[key].includes(x)),
        ]),
      ];
  if (!Array.isArray(raw.remembered))
    base.remembered = ["ferryman", "gardener", "heart"]
      .filter((id) => base.lore.includes(id))
      .map((id) => `keeper:${id}`);
  if (!Array.isArray(raw.endings) && base.victories) base.endings = ["dawn"];
  for (const key of ["music", "effects"])
    if (Number.isFinite(raw.settings?.[key]))
      base.settings[key] = Math.max(0, Math.min(1, raw.settings[key]));
  for (const key of ["shake", "flashes", "autoAim"])
    if (typeof raw.settings?.[key] === "boolean")
      base.settings[key] = raw.settings[key];
  const keybindings = normalizeBindings(raw.settings?.keybindings);
  if (keybindings) base.settings.keybindings = keybindings;
  const keyLabels = normalizeKeyLabels(raw.settings?.keyLabels, keybindings);
  if (keyLabels) base.settings.keyLabels = keyLabels;
  const lastReturn = normalizeReturnRecord(raw.lastReturn);
  if (lastReturn) base.lastReturn = lastReturn;
  const r = raw.run;
  if (
    r &&
    typeof r.seed === "string" &&
    Number.isInteger(r.stage) &&
    r.stage >= 0 &&
    r.stage < ROOM_COUNT &&
    WEAPONS.some((w) => w.id === r.weapon) &&
    RELICS.some((w) => w.id === r.relic) &&
    Number.isFinite(r.hp) &&
    r.hp > 0 &&
    Number.isFinite(r.maxHp)
  ) {
    const maxHp = Math.max(100, Math.min(240, r.maxHp));
    base.run = {
      seed: r.seed.slice(0, 32),
      catalogVersion:
        r.catalogVersion === CATALOG_VERSION
          ? CATALOG_VERSION
          : r.catalogVersion === 2
            ? 2
            : 1,
      layoutVersion:
        r.layoutVersion === ROOM_LAYOUT_VERSION ? ROOM_LAYOUT_VERSION : 1,
      stage: r.stage,
      weapon: r.weapon,
      relic: r.relic,
      maxHp,
      hp: Math.min(r.hp, maxHp),
      upgrades: {},
      route: ["loom", "rest", "salvage"].includes(r.route) ? r.route : "loom",
      checkpoint: r.checkpoint === "cleared" ? "cleared" : "entry",
      bosses: Array.isArray(r.bosses)
        ? r.bosses.filter((id) =>
            ["ferryman", "gardener", "heart"].includes(id),
          )
        : [],
    };
    if (r.relic === "bell" && r.bellVersion === 2) {
      base.run.bellVersion = 2;
      base.run.bellCuts = Number.isSafeInteger(r.bellCuts)
        ? Math.max(0, r.bellCuts)
        : 0;
      base.run.bellRecovered = Number.isFinite(r.bellRecovered)
        ? Math.max(0, r.bellRecovered)
        : 0;
    }
    if (r.encounterVersion === 1) base.run.encounterVersion = 1;
    if (r.chargeVersion === 1) base.run.chargeVersion = 1;
    const eligible = new Set(catalogUpgrades(base.run));
    for (const u of UPGRADES)
      base.run.upgrades[u.id] = Math.max(
        0,
        Math.min(
          u.max,
          eligible.has(u) && Number.isInteger(r.upgrades?.[u.id])
            ? r.upgrades[u.id]
            : 0,
        ),
      );
    for (const key of [
      "scrap",
      "kills",
      "time",
      "memory",
      "damageTaken",
      "echoesCast",
      "threadKills",
      "cordCuts",
      "memoryCuts",
      "prismSplits",
    ])
      base.run[key] = Number.isFinite(r[key]) ? Math.max(0, r[key]) : 0;
    for (const key of ["threadCuts", "threadReturns", "needleStitches"])
      base.run[key] = Number.isSafeInteger(r[key]) ? Math.max(0, r[key]) : 0;
    base.run.beacons = Array.isArray(r.beacons)
      ? [
          ...new Set(
            r.beacons.filter(
              (n) =>
                Number.isInteger(n) &&
                n >= 0 &&
                n <= r.stage &&
                [3, 4].includes(roomIndex(n)),
            ),
          ),
        ]
      : [];
    base.run.repairs = Array.isArray(r.repairs)
      ? [
          ...new Set(
            r.repairs.filter(
              (n) =>
                Number.isInteger(n) && n >= 0 && n <= r.stage && roomFeature(n),
            ),
          ),
        ]
      : [];
    base.run.difficulty = [0, 1, 2].includes(r.difficulty) ? r.difficulty : 0;
    base.run.journal = [];
    if (Array.isArray(r.journal)) {
      for (const entry of r.journal) {
        const story = STORIES.find((s) => s.id === entry?.id);
        if (
          story &&
          Number.isInteger(entry.stage) &&
          entry.stage >= 0 &&
          entry.stage <= r.stage &&
          isCamp(entry.stage) &&
          actIndex(entry.stage) === story.act &&
          story.choices.some((c) => c.id === entry.choice) &&
          !base.run.journal.some(
            (e) => e.stage === entry.stage || e.id === entry.id,
          )
        )
          base.run.journal.push({
            id: entry.id,
            choice: entry.choice,
            stage: entry.stage,
          });
      }
    }
    base.run.startingFragment = CITY_PROJECTS.some(
      (p) =>
        p.fragment === r.startingFragment && base.run.upgrades[p.fragment] > 0,
    )
      ? r.startingFragment
      : null;
    const storyReward = base.run.journal.some(
      (entry) =>
        entry.stage === r.stage &&
        STORIES.find((story) => story.id === entry.id)?.choices.some(
          (choice) => choice.id === entry.choice && choice.offer,
        ),
    );
    const hasReward =
      r.stage < ROOM_COUNT - 1 &&
      (isCamp(r.stage)
        ? base.run.route === "loom" && storyReward
        : base.run.route === "loom" || isBoss(r.stage) || isElite(r.stage));
    if (r.checkpoint === "reward" && hasReward) base.run.checkpoint = "reward";
    const atTrader = isCamp(r.stage) && base.run.route === "salvage";
    if (r.checkpoint === "shop" && atTrader) base.run.checkpoint = "shop";
    if (atTrader && ["shop", "cleared"].includes(base.run.checkpoint))
      base.run.shopBought = validTraderPurchases(base.run, r.shopBought);
    base.run.rewardRoll =
      ["reward", "cleared"].includes(base.run.checkpoint) &&
      Number.isInteger(r.rewardRoll)
        ? Math.max(0, Math.min(REWARD_REROLL_LIMIT, r.rewardRoll))
        : 0;
  }
  return base;
}
function profileData(raw) {
  return (
    !!raw &&
    !Array.isArray(raw) &&
    raw.version === 1 &&
    ["memory", "attempts", "victories", "best", "totalKills"].every(
      (key) => Number.isFinite(raw[key]) && raw[key] >= 0,
    ) &&
    Array.isArray(raw.unlocked) &&
    Array.isArray(raw.lore) &&
    !!raw.settings &&
    typeof raw.settings === "object"
  );
}
function storedProfile(text) {
  const raw = JSON.parse(text);
  return profileData(raw) ? validateProfile(raw) : null;
}
export function loadState(storage = null) {
  try {
    const store = storage || globalThis.localStorage;
    const text = store.getItem(SAVE_KEY);
    let profile = null;
    try {
      profile = storedProfile(text);
    } catch {}
    if (profile) return { profile, source: "main" };
    try {
      profile = storedProfile(store.getItem(RECOVERY_KEY));
    } catch {}
    if (profile) return { profile, source: "recovery" };
    return { profile: freshProfile(), source: text ? "damaged" : "fresh" };
  } catch {
    return { profile: freshProfile(), source: "unavailable" };
  }
}
export function loadProfile(storage = null) {
  return loadState(storage).profile;
}
export function saveProfile(profile, storage = null) {
  try {
    const store = storage || globalThis.localStorage;
    const next = JSON.stringify(profile);
    let previous = null;
    try {
      const text = store.getItem(SAVE_KEY);
      if (storedProfile(text)) previous = text;
    } catch {}
    // A failed spare copy must never prevent saving the current voyage.
    if (previous && previous !== next)
      try {
        store.setItem(RECOVERY_KEY, previous);
      } catch {}
    store.setItem(SAVE_KEY, next);
    if (!previous)
      try {
        store.setItem(RECOVERY_KEY, next);
      } catch {}
    return true;
  } catch {
    return false;
  }
}
export function exportProfile(profile, date = new Date()) {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: 1,
      createdAt: date.toISOString(),
      profile: validateProfile(profile),
    },
    null,
    2,
  );
}
export function prepareImport(text) {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw Error(
      "このファイルは大きすぎます。残響の灯台の記録を選んでください。",
    );
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("ファイルを読めませんでした。書き出した記録を選んでください。");
  }
  const envelope = data?.format === BACKUP_FORMAT;
  if (envelope && data.version !== 1)
    throw Error("この記録の形式には、まだ対応していません。");
  const raw = envelope ? data.profile : data;
  if (!profileData(raw))
    throw Error("残響の灯台の記録として確認できませんでした。");
  const profile = validateProfile(raw);
  if (raw.run && !profile.run)
    throw Error("途中の航路が壊れています。別の書き出し記録を選んでください。");
  return {
    profile,
    createdAt:
      envelope &&
      typeof data.createdAt === "string" &&
      Number.isFinite(Date.parse(data.createdAt))
        ? new Date(data.createdAt).toISOString()
        : null,
  };
}
export function loadImportUndo(storage = null) {
  try {
    return storedProfile(
      (storage || globalThis.localStorage).getItem(IMPORT_UNDO_KEY),
    );
  } catch {
    return null;
  }
}
export function saveImportedProfile(next, current, storage = null) {
  let backupSaved = false;
  try {
    (storage || globalThis.localStorage).setItem(
      IMPORT_UNDO_KEY,
      JSON.stringify(current),
    );
    backupSaved = true;
  } catch {}
  return { saved: saveProfile(next, storage), backupSaved };
}

// Each tab remembers the exact record it opened or wrote. A stale tab may
// offer a choice, but must not silently replace another tab's progress.
export class SaveSession {
  constructor(storage = null) {
    this.storage = storage;
    this.state = loadState(storage);
    this.expected = this.readMain().text;
  }
  readMain() {
    try {
      return {
        ok: true,
        text: (this.storage || globalThis.localStorage).getItem(SAVE_KEY),
      };
    } catch {
      return { ok: false, text: null };
    }
  }
  changed() {
    const current = this.readMain();
    return current.ok && current.text !== this.expected;
  }
  save(profile) {
    if (this.changed()) return { saved: false, conflict: true };
    const saved = saveProfile(profile, this.storage);
    if (saved) this.expected = JSON.stringify(profile);
    return { saved, conflict: false };
  }
  replace(next, current) {
    if (this.changed()) return { saved: false, conflict: true };
    const result = saveImportedProfile(next, current, this.storage);
    if (result.saved) this.expected = JSON.stringify(next);
    return { ...result, conflict: false };
  }
  accept() {
    this.state = loadState(this.storage);
    this.expected = this.readMain().text;
    return this.state;
  }
  overwrite(profile) {
    this.expected = this.readMain().text;
    return this.save(profile);
  }
}
