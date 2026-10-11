import {
  WEAPONS,
  RELICS,
  ROOM_COUNT,
  catalogUpgrades,
  rank,
  stats,
} from "../../../src/content.js";
import {
  bellRelicDescription,
  bellSeconds,
  weavesBell,
} from "../../../src/bell-weave.js";
import { rewindsEchoes } from "../../../src/echo-playback.js";

const counts = [
  "kills",
  "echoesCast",
  "threadKills",
  "threadCuts",
  "threadReturns",
  "cordCuts",
  "memoryCuts",
  "prismSplits",
  "needleStitches",
];
const finite = (value, max = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(value) && value >= 0 && value <= max;

// A return is a small, read-only record. It never contains a resumable room,
// actors, a replay history or combat RNG. Old profiles simply omit this field.
export function normalizeReturnRecord(raw) {
  const r = raw?.run,
    light = raw?.light;
  if (
    raw?.version !== 1 ||
    !["victory", "defeat"].includes(raw.outcome) ||
    !Number.isSafeInteger(raw.memory) ||
    !finite(raw.memory) ||
    typeof r?.seed !== "string" ||
    !r.seed.length ||
    !WEAPONS.some((w) => w.id === r.weapon) ||
    !RELICS.some((w) => w.id === r.relic) ||
    !Number.isInteger(r.stage) ||
    r.stage < 0 ||
    r.stage >= ROOM_COUNT ||
    (raw.outcome === "victory" && r.stage !== ROOM_COUNT - 1) ||
    ![0, 1, 2].includes(r.difficulty) ||
    ![1, 2, 3].includes(r.catalogVersion) ||
    !finite(r.time) ||
    !finite(r.damageTaken) ||
    !counts.every((k) => Number.isSafeInteger(r[k]) && finite(r[k])) ||
    !Number.isInteger(light?.capacity) ||
    light.capacity < 1 ||
    light.capacity > 3 ||
    !finite(light.chargeSeconds, 120) ||
    light.chargeSeconds <= 0 ||
    !finite(light.lifeSeconds, 120) ||
    light.lifeSeconds <= 0 ||
    !["forward", "reverse"].includes(light.playback)
  )
    return null;
  const run = {
    seed: r.seed.slice(0, 32),
    weapon: r.weapon,
    relic: r.relic,
    stage: r.stage,
    difficulty: r.difficulty,
    catalogVersion: r.catalogVersion,
    time: r.time,
    damageTaken: r.damageTaken,
    ...Object.fromEntries(counts.map((k) => [k, r[k]])),
    upgrades: {},
    startingFragment: null,
  };
  if (weavesBell(r)) {
    if (
      !Number.isSafeInteger(r.bellCuts) ||
      !finite(r.bellCuts) ||
      !finite(r.bellRecovered)
    )
      return null;
    Object.assign(run, {
      bellVersion: 2,
      bellCuts: r.bellCuts,
      bellRecovered: r.bellRecovered,
    });
  }
  if (r.encounterVersion === 1) run.encounterVersion = 1;
  for (const u of catalogUpgrades(run)) {
    const level = r.upgrades?.[u.id];
    if (Number.isInteger(level) && level > 0)
      run.upgrades[u.id] = Math.min(level, u.max);
  }
  if (light.playback !== (rewindsEchoes(run) ? "reverse" : "forward"))
    return null;
  if (
    typeof r.startingFragment === "string" &&
    run.upgrades[r.startingFragment]
  )
    run.startingFragment = r.startingFragment;
  return {
    version: 1,
    outcome: raw.outcome,
    memory: raw.memory,
    run,
    // These are the actual values at return, not recalculated after a balance update.
    light: {
      capacity: light.capacity,
      chargeSeconds: light.chargeSeconds,
      lifeSeconds: light.lifeSeconds,
      playback: light.playback,
    },
  };
}

export function makeReturnRecord(run, victory, memory) {
  const s = stats(run);
  return normalizeReturnRecord({
    version: 1,
    outcome: victory ? "victory" : "defeat",
    memory,
    run: { ...run, ...Object.fromEntries(counts.map((k) => [k, run[k] || 0])) },
    light: {
      capacity: s.echoes,
      chargeSeconds: s.echoCooldown,
      lifeSeconds: s.echoDuration,
      playback: rewindsEchoes(run) ? "reverse" : "forward",
    },
  });
}

export function returnReadout(record) {
  const { run } = record;
  const fragments = catalogUpgrades(run)
    .filter((u) => rank(run, u.id))
    .map((u) => ({ ...u, level: rank(run, u.id) }));
  const performance = [
    ["光糸でほどいた影", run.threadKills, "体"],
    ["糸でほどいた弾", run.threadCuts, "発"],
    ["放った返し針", run.threadReturns, "本"],
    ["切った赤い結び", run.cordCuts, "本"],
    ["奪い返した昨日", run.memoryCuts, "回"],
    ["分光", run.prismSplits, "回"],
    ["合わせ縫い", run.needleStitches, "回"],
  ].filter(([, value]) => value > 0);
  if (weavesBell(run)) {
    if (run.bellCuts) performance.push(["鈴でほどいた弾", run.bellCuts, "発"]);
    if (run.bellRecovered)
      performance.push([
        "鈴が戻した充填",
        bellSeconds(run.bellRecovered),
        "秒",
      ]);
  }
  const relic = RELICS.find((r) => r.id === run.relic);
  return {
    weapon: WEAPONS.find((w) => w.id === run.weapon),
    relic: { ...relic, desc: bellRelicDescription(run, relic.desc) },
    difficulty: ["凪", "荒潮", "深淵"][run.difficulty],
    fragments,
    levels: fragments.reduce((n, u) => n + u.level, 0),
    performance,
    light: { ...record.light },
  };
}
