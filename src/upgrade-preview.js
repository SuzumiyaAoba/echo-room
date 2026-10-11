import { WEAPONS, catalogUpgrades, rank, stats } from "./content.js";
import { STORED_LIGHT_LIMIT, RETURN_LIGHT_DAMAGE } from "./counter-thread.js";
import { rewindsEchoes } from "./echo-playback.js";

const metric = (key, label, value, unit = "", digits = 0) => ({
  key,
  label,
  value,
  unit,
  digits,
});
const returnedDamage = (run, s) =>
  rank(run, "counter")
    ? RETURN_LIGHT_DAMAGE * s.damage * (1 + rank(run, "echopower") * 0.3)
    : 0;

// Values describe the build, not a prediction of damage through enemy armor.
// Reading them never creates a room, rolls rewards, or applies an upgrade.
export function upgradeEffects(run, id) {
  const s = stats(run),
    weapon = WEAPONS.find((w) => w.id === run.weapon),
    active = (key) => rank(run, key) > 0;
  const counter = () =>
    metric("returnedDamage", "返し針の基礎威力", returnedDamage(run, s), "", 1);
  switch (id) {
    case "rewind":
      return [
        metric(
          "playback",
          "残響の道",
          rewindsEchoes(run) ? "今から昔へ" : "昔から今へ",
        ),
        metric(
          "anchor",
          "再生後に糸を留める場所",
          rewindsEchoes(run) ? "録画の始点" : "呼んだ場所",
        ),
      ];
    case "double":
      return [metric("echoes", "残響の最大数", s.echoes, "体")];
    case "duration":
      return [metric("echoDuration", "残響の寿命", s.echoDuration, "秒", 1)];
    case "quickecho":
      return [metric("echoCooldown", "一回の充填", s.echoCooldown, "秒", 1)];
    case "echopower":
      return [
        metric(
          "echoDamage",
          "残響の基礎威力",
          weapon.damage * s.damage * s.echoDamage,
          "",
          1,
        ),
        ...(active("counter") ? [counter()] : []),
      ];
    case "thread":
      return [metric("thread", "光糸の威力", (s.thread / 20) * 100, "%")];
    case "wide":
      return [metric("threadWidth", "攻撃と防御の幅", s.threadWidth)];
    case "triangle":
      return [
        metric(
          "triangle",
          "光糸の攻撃領域",
          active("triangle") ? "三角の内側も" : "ミナとの糸",
        ),
      ];
    case "suture":
      return [metric("suture", "糸で撃破時の回復", active("suture") ? 2 : 0)];
    case "burst":
      return [
        metric("burst", "解放の基礎威力", s.burst, "", 1),
        metric("burstRadius", "解放の範囲", s.burstRadius),
      ];
    case "refund":
      return [
        metric("refund", "解放の撃破1体", active("refund") ? 1 : 0, "秒短縮"),
      ];
    case "cascade":
      return [
        metric(
          "cascade",
          "弾消しで追加光弾",
          active("cascade") ? "1発ごと1本・最大24本" : "なし",
        ),
      ];
    case "damage":
      return [
        metric("damage", "光弾1本の基礎威力", weapon.damage * s.damage, "", 1),
        ...(active("counter") ? [counter()] : []),
      ];
    case "rapid":
      return [
        metric("fireRate", "射撃の間隔", weapon.rate / s.fireRate, "秒", 2),
      ];
    case "pierce":
      return [
        metric(
          "pierce",
          "光弾1本の最大命中",
          1 + weapon.pierce + s.pierce,
          "体",
        ),
      ];
    case "homing":
      return [
        metric(
          "homing",
          "残響の光弾",
          active("homing") ? "敵へ曲がる" : "直進",
        ),
      ];
    case "crit":
      return [metric("crit", "射撃の会心率", rank(run, "crit") * 20, "%")];
    case "dash":
      return [metric("dashCooldown", "回避の充填", s.dashCooldown, "秒", 2)];
    case "dashshot":
      return [
        metric(
          "dashshot",
          "回避の出発点の光弾",
          active("dashshot") ? 8 : 0,
          "本",
        ),
      ];
    case "dashthread":
      return [
        metric(
          "dashthread",
          "回避の織り撃ち",
          active("dashthread") ? "光糸の3倍" : "なし",
        ),
      ];
    case "health":
      return [
        metric("maxHp", "最大体力", run.maxHp),
        metric("hp", "体力", Math.ceil(run.hp)),
      ];
    case "shield":
      return [
        metric("shield", "各部屋の被弾無効", active("shield") ? 1 : 0, "回"),
      ];
    case "speed":
      return [metric("speed", "移動速度", (s.speed / 90) * 100, "%")];
    case "salvage":
      return [
        metric(
          "salvage",
          "敵の歯車の倍率",
          1 + rank(run, "salvage") * 0.4,
          "倍",
          1,
        ),
      ];
    case "resonance":
      return [
        metric("resonance", "呼ぶ瞬間の基礎威力", active("resonance") ? 30 : 0),
      ];
    case "counter":
      return [
        metric(
          "returnStock",
          "残響1体の蓄え",
          active("counter") ? STORED_LIGHT_LIMIT : 0,
          "発",
        ),
        counter(),
      ];
    default:
      return [];
  }
}

export function previewUpgrade(run, id) {
  const upgrade = catalogUpgrades(run).find((u) => u.id === id),
    level = rank(run, id);
  if (
    !upgrade ||
    level >= upgrade.max ||
    (upgrade.requires && !rank(run, upgrade.requires))
  )
    return null;
  const next = { ...run, upgrades: { ...run.upgrades, [id]: level + 1 } };
  if (id === "health") {
    next.maxHp += 20;
    next.hp = Math.min(next.maxHp, next.hp + 20);
  }
  const after = upgradeEffects(next, id);
  return {
    level,
    nextLevel: level + 1,
    rows: upgradeEffects(run, id).map(({ value, ...row }, index) => ({
      ...row,
      before: value,
      after: after[index].value,
    })),
  };
}

export function effectText(row, value) {
  return typeof value === "number"
    ? `${value.toFixed(row.digits)}${row.unit}`
    : value;
}
