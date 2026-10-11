import { UPGRADES, isCamp, rank } from "./content.js";
import { rewardPlan } from "./rewards.js";

export const TRADER_HEAL_PRICE = 20;
export const TRADER_HEAL_AMOUNT = 30;
export const traderPrice = (fragment) =>
  ({ common: 30, rare: 45, legendary: 65 })[fragment.rarity];

export function traderStock(run) {
  if (!isCamp(run.stage) || run.route !== "salvage") return [];
  // Reconstruct the ranks at arrival so purchases never replace the stock.
  // This also preserves a fragment bought at its cap, and a prerequisite
  // bought here cannot add a new item to the same trader's inventory.
  const arrival = { ...run, rewardRoll: 0, upgrades: { ...run.upgrades } };
  for (const id of new Set(run.shopBought || []))
    arrival.upgrades[id] = Math.max(0, rank(arrival, id) - 1);
  return rewardPlan(arrival).offers;
}

export function forecastTrader(run, stage) {
  const planned = { ...run, stage, route: "salvage", rewardRoll: 0 };
  delete planned.shopBought;
  return traderStock(planned);
}

export function validTraderPurchases(run, raw) {
  if (!isCamp(run.stage) || run.route !== "salvage" || !Array.isArray(raw))
    return [];
  let bought = [...new Set(raw)]
    .filter((id) => UPGRADES.some((u) => u.id === id) && rank(run, id) > 0)
    .slice(0, 3);
  // Dropping an invalid entry can change the reconstructed arrival pool.
  // At most three entries can disappear before the remaining list is stable.
  for (let attempt = 0; attempt < 3; attempt++) {
    const ids = traderStock({ ...run, shopBought: bought }).map((u) => u.id);
    const next = bought.filter((id) => ids.includes(id));
    if (next.length === bought.length) break;
    bought = next;
  }
  return bought;
}
