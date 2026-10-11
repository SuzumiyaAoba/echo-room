import { createRun } from "../../src/game.js";
import { rewardPlan } from "../../src/rewards.js";
import { traderStock } from "../../src/trader.js";
import { freshProfile } from "../../src/save.js";

function profile(run) {
  const p = freshProfile();
  p.attempts = 2;
  p.victories = 1;
  p.unlocked.push("prism");
  p.run = run;
  return p;
}
export function weavingChoiceProfile() {
  const run = createRun("STYLE-1", "prism", "spool", 2);
  Object.assign(run, {
    stage: 7,
    checkpoint: "reward",
    hp: 89,
    maxHp: 120,
    scrap: 100,
    upgrades: { duration: 1, double: 1, health: 1, thread: 1, wide: 1 },
  });
  return profile(run);
}
export function offeredProfile(id, extra = {}, shop = false) {
  for (let index = 0; index < 300; index++) {
    const run = createRun(`PREVIEW-${id}-${index}`, "prism", "spool", 2);
    Object.assign(run, {
      stage: shop ? 2 : 7,
      route: shop ? "salvage" : "loom",
      checkpoint: shop ? "shop" : "reward",
      hp: 40,
      scrap: 150,
      ...extra,
    });
    const offers = shop ? traderStock(run) : rewardPlan(run).offers;
    if (offers.some((u) => u.id === id)) return profile(run);
  }
  throw new Error(`No legal ${shop ? "trader" : "reward"} fixture for ${id}`);
}
