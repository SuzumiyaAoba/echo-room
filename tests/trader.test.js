import test from "node:test";
import assert from "node:assert/strict";
import { Game, createRun } from "../src/game.js";
import { UPGRADES, rank } from "../src/content.js";
import {
  traderStock,
  forecastTrader,
  traderPrice,
  validTraderPurchases,
} from "../src/trader.js";
import {
  freshProfile,
  exportProfile,
  prepareImport,
  validateProfile,
} from "../src/save.js";

const camps = [2, 5, 10, 13, 18, 21];
function traderRun(seed = "TRADER-TEST", stage = 2) {
  return Object.assign(createRun(seed), {
    stage,
    route: "salvage",
    scrap: 300,
    hp: 40,
  });
}
function restored(run) {
  const p = freshProfile();
  p.run = structuredClone(run);
  return prepareImport(exportProfile(p)).profile.run;
}

test("1,800の行商で予告と在庫が一致し、各購入と移行後にも三枚と価格を保つ", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const stage of camps) {
      const run = traderRun(`TRADER-${seed}`, stage);
      for (const [index, u] of UPGRADES.entries())
        run.upgrades[u.id] = (seed + stage + index) % (u.max + 1);
      run.maxHp = 100 + 20 * rank(run, "health");
      const previous = {
        ...run,
        stage: stage - 1,
        rewardRoll: 2,
        shopBought: ["damage"],
      };
      const forecast = forecastTrader(previous, stage);
      const g = new Game(run);
      const stock = traderStock(g.run);
      assert.deepEqual(stock, forecast);
      assert.ok(stock.every((u) => rank(run, u.id) < u.max));
      assert.ok(stock.every((u) => !u.requires || rank(run, u.requires) > 0));
      assert.ok(stock.every((u) => u.rarity !== "legendary" || stage >= 6));
      assert.equal(new Set(stock.map((u) => u.id)).size, stock.length);
      const rng = g.rng.state;
      for (const u of stock) {
        const cash = g.run.scrap,
          beforeRank = rank(g.run, u.id);
        assert.equal(g.buyUpgrade(u.id), true);
        assert.equal(g.run.scrap, cash - traderPrice(u));
        assert.equal(rank(g.run, u.id), beforeRank + 1);
        assert.equal(g.buyUpgrade(u.id), false);
        assert.deepEqual(traderStock(g.run), stock);
        g.run.checkpoint = "shop";
        const saved = restored(g.run);
        assert.equal(saved.checkpoint, "shop");
        assert.deepEqual(saved.shopBought, g.run.shopBought);
        assert.equal(saved.scrap, g.run.scrap);
        assert.equal(saved.hp, g.run.hp);
        assert.deepEqual(traderStock(saved), stock);
      }
      assert.equal(g.rng.state, rng);
      assert.equal(g.run.time, 0);
      assert.equal(g.run.kills, 0);
    }
  }
});

test("行商以外・未販売・費用不足・購入済みは買えず、金額と強化を変えない", () => {
  const g = new Game(traderRun());
  const u = traderStock(g.run)[0];
  g.run.scrap = traderPrice(u) - 1;
  const unchanged = structuredClone(g.run);
  assert.equal(g.buyUpgrade(u.id), false);
  assert.deepEqual(g.run, unchanged);
  g.run.scrap = 300;
  for (const mode of ["combat", "reward", "cleared", "dead"]) {
    g.mode = mode;
    assert.equal(g.buyUpgrade(u.id), false);
  }
  g.mode = "event";
  const unavailable = UPGRADES.find(
    (item) => !traderStock(g.run).includes(item),
  );
  assert.equal(g.buyUpgrade(unavailable.id), false);
  assert.equal(g.buyUpgrade("unknown"), false);
  assert.equal(g.buyUpgrade(u.id), true);
  const once = structuredClone(g.run);
  assert.equal(g.buyUpgrade(u.id), false);
  assert.deepEqual(g.run, once);
  const rest = new Game({ ...traderRun(), route: "rest" });
  assert.equal(rest.buyUpgrade(u.id), false);
  const battle = new Game({ ...traderRun(), stage: 1 });
  battle.mode = "event";
  assert.equal(battle.buyUpgrade(u.id), false);
});

test("回復は歯車20で30だけ増え、最大体力・不足・行商以外では支払わない", () => {
  const g = new Game(traderRun());
  assert.equal(g.buyHeal(), true);
  assert.equal(g.run.hp, 70);
  assert.equal(g.run.scrap, 280);
  assert.equal(g.buyHeal(), true);
  assert.equal(g.run.hp, 100);
  assert.equal(g.run.scrap, 260);
  assert.equal(g.buyHeal(), false);
  assert.equal(g.run.scrap, 260);
  g.run.hp = 95;
  assert.equal(g.buyHeal(), true);
  assert.equal(g.run.hp, 100);
  g.run.hp = 40;
  g.run.scrap = 19;
  assert.equal(g.buyHeal(), false);
  g.run.scrap = 100;
  for (const mode of ["combat", "reward", "cleared", "dead"]) {
    g.mode = mode;
    assert.equal(g.buyHeal(), false);
  }
  g.mode = "event";
  g.run.route = "rest";
  assert.equal(g.buyHeal(), false);
  g.run.route = "salvage";
  g.run.stage = 1;
  assert.equal(g.buyHeal(), false);
  assert.equal(g.run.hp, 40);
  assert.equal(g.run.scrap, 100);
});

test("行商の保存は購入を正規化し、旧入口と部屋を出た後・次の在庫を区別する", () => {
  const g = new Game(traderRun());
  const first = traderStock(g.run)[0];
  g.buyUpgrade(first.id);
  g.run.checkpoint = "shop";
  const p = freshProfile();
  p.run = g.run;
  const saved = validateProfile(p).run;
  assert.deepEqual(saved.shopBought, [first.id]);
  assert.equal(saved.rewardRoll, 0);
  assert.deepEqual(
    validTraderPurchases(saved, [first.id, first.id, "unknown", null]),
    [first.id],
  );
  assert.deepEqual(validTraderPurchases(saved, ["unknown", "triangle"]), []);
  p.run.checkpoint = "cleared";
  assert.deepEqual(validateProfile(p).run.shopBought, [first.id]);
  p.run.checkpoint = "entry";
  assert.equal(validateProfile(p).run.shopBought, undefined);
  assert.equal(restored(traderRun()).checkpoint, "entry");
  p.run.checkpoint = "shop";
  p.run.route = "rest";
  assert.equal(validateProfile(p).run.checkpoint, "entry");
  p.run.route = "salvage";
  p.run.stage = 1;
  assert.equal(validateProfile(p).run.checkpoint, "entry");
  const before = structuredClone(saved);
  const cleanNext = { ...saved, stage: 5, rewardRoll: 0 };
  delete cleanNext.shopBought;
  assert.deepEqual(forecastTrader(saved, 5), traderStock(cleanNext));
  assert.deepEqual(saved, before);
});
