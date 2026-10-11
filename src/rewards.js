import { Random } from "./math.js";
import {
  catalogUpgrades,
  rank,
  actIndex,
  roomIndex,
  isCamp,
  isBoss,
  isElite,
} from "./content.js";

export const WEAVE_THEMES = [
  { id: "echo", tag: "残響", name: "昨日を重ねる織室", icon: "echo" },
  { id: "thread", tag: "光糸", name: "光糸を結ぶ織室", icon: "thread" },
  { id: "release", tag: "解放", name: "星をほどく織室", icon: "star" },
  { id: "needle", tag: "射撃", name: "針を研ぐ織室", icon: "needle" },
  { id: "footwork", tag: "回避", name: "足跡を織る織室", icon: "dash" },
];

export const REWARD_REROLL_LIMIT = 2;
const rerollCount = (run) =>
  Number.isInteger(run.rewardRoll)
    ? Math.max(0, Math.min(REWARD_REROLL_LIMIT, run.rewardRoll))
    : 0;

export function weaveTheme(run) {
  if (
    run.stage === 0 ||
    run.route !== "loom" ||
    isCamp(run.stage) ||
    isBoss(run.stage)
  )
    return null;
  const position = [0, 1, 3, 4, 6].indexOf(roomIndex(run.stage));
  return (
    new Random(`${run.seed}:${actIndex(run.stage)}:weave-themes`).shuffle(
      WEAVE_THEMES,
    )[position] || null
  );
}

export function rewardPlan(run, count = 3) {
  const pool = catalogUpgrades(run).filter(
    (u) =>
      rank(run, u.id) < u.max &&
      (!u.requires || rank(run, u.requires) > 0) &&
      (u.rarity !== "legendary" || run.stage >= 6),
  );
  const original = new Random(`${run.seed}:${run.stage}:rewards`).shuffle(pool);
  const rareRoom = isBoss(run.stage) || isElite(run.stage);
  const theme = weaveTheme(run);
  const themed = original.filter((u) => u.tag === theme?.tag);
  // An elite's themed rare fragment satisfies both promises with one slot.
  const promised =
    (rareRoom && themed.find((u) => u.rarity !== "common")) ||
    themed[0] ||
    null;
  let offers = [];
  for (let roll = 0; roll <= rerollCount(run); roll++) {
    const shuffled = roll
      ? new Random(`${run.seed}:${run.stage}:rewards:${roll}`).shuffle(pool)
      : original;
    // Keep the advertised fragment. Prefer genuinely different alternatives;
    // a scarce rare pool may reuse a rare to honor an elite's reward as well.
    const candidates = [
      ...shuffled.filter((u) => !offers.includes(u)),
      ...shuffled.filter((u) => offers.includes(u)),
    ];
    const selected = [];
    const add = (u) => {
      if (u && !selected.includes(u)) selected.push(u);
    };
    if (rareRoom)
      add(
        promised && promised.rarity !== "common"
          ? promised
          : candidates.find((u) => u.rarity !== "common"),
      );
    add(promised);
    candidates.forEach(add);
    offers = selected.slice(0, Math.max(0, count));
  }
  return {
    theme,
    promised: offers.includes(promised) ? promised : null,
    offers,
  };
}

export function rewardRerollState(run) {
  const used = rerollCount(run),
    cost = 12 + used * 8;
  const current = rewardPlan(run).offers;
  const next = rewardPlan({ ...run, rewardRoll: used + 1 }).offers;
  const changes = next.some((u) => !current.includes(u));
  const reason =
    used >= REWARD_REROLL_LIMIT
      ? "limit"
      : !changes
        ? "exhausted"
        : run.scrap < cost
          ? "cost"
          : null;
  return {
    used,
    cost,
    limit: REWARD_REROLL_LIMIT,
    changes,
    reason,
    available: !reason,
  };
}
