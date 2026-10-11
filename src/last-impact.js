import { ENEMIES } from "./content.js";

const types = new Set([
  "contact",
  "charge",
  "projectile",
  "bloom",
  "line",
  "cord",
  "stolen",
  "tide",
  "gardenShot",
  "furnaceShot",
  "unknown",
]);
const fixedEnemy = {
  bloom: "gardener",
  line: "heart",
  cord: "weaver",
  stolen: "weaver",
};
const enemyKind = (value) =>
  typeof value === "string" && Object.hasOwn(ENEMIES, value);
const tag = (type, enemy = null, elite = false) => ({
  type,
  enemy,
  elite: !!elite && !!enemy && !ENEMIES[enemy].boss,
});

// Only compact identifiers cross the save boundary. Names, advice, positions,
// actor references and replay histories are never accepted from a save file.
export function normalizeImpactSource(raw) {
  if (!raw || !types.has(raw.type) || typeof raw.elite !== "boolean")
    return null;
  const enemy = raw.enemy;
  if (enemy !== null && !enemyKind(enemy)) return null;
  if (fixedEnemy[raw.type] && enemy !== fixedEnemy[raw.type]) return null;
  if (["contact", "charge"].includes(raw.type) && !enemy) return null;
  if (raw.type === "charge" && !["charger", "ferryman"].includes(enemy))
    return null;
  if (
    ["unknown", "tide", "gardenShot", "furnaceShot"].includes(raw.type) &&
    enemy !== null
  )
    return null;
  if (raw.elite && (!enemy || ENEMIES[enemy].boss)) return null;
  return tag(raw.type, enemy, raw.elite);
}

// Retain the real emitter while the projectile is alive, even if the enemy is
// defeated before its shot arrives. This annotation never participates in combat.
export function bulletImpactSource(game, source) {
  if (game.enemies.includes(source) && enemyKind(source.kind))
    return tag("projectile", source.kind, source.elite);
  if (game.apparatus?.objects?.includes(source)) {
    if (game.apparatus.kind === "garden") return tag("gardenShot");
    if (game.apparatus.kind === "furnace") return tag("furnaceShot");
  }
  return tag("projectile");
}

export function impactSource(game, source) {
  if (game.bullets.includes(source) && source.friendly === false)
    return normalizeImpactSource(source.impactSource) || tag("projectile");
  if (game.enemies.includes(source) && enemyKind(source.kind))
    return tag(
      source.state === "charge" && ["charger", "ferryman"].includes(source.kind)
        ? "charge"
        : "contact",
      source.kind,
      source.elite,
    );
  if (game.hazards.includes(source)) {
    const type = source.kind === "stolenEcho" ? "stolen" : source.kind;
    if (Object.hasOwn(fixedEnemy, type))
      return tag(type, fixedEnemy[type], (source.owner || source.a)?.elite);
  }
  if (source?.kind === "tide") return tag("tide");
  return tag("unknown");
}

export function normalizeLastHit(raw) {
  const source = normalizeImpactSource(raw);
  if (
    raw?.version !== 1 ||
    !source ||
    !Number.isFinite(raw.damage) ||
    raw.damage <= 0 ||
    raw.damage > 1e6 ||
    !Number.isFinite(raw.hpBefore) ||
    raw.hpBefore <= 0 ||
    raw.hpBefore > 240
  )
    return null;
  return { version: 1, ...source, damage: raw.damage, hpBefore: raw.hpBefore };
}

export function lastHitAtReturn(game) {
  const cue = game.hitCue;
  if (
    game.practice ||
    game.mode !== "dead" ||
    game.run.hp !== 0 ||
    cue?.kind !== "hurt"
  )
    return null;
  return normalizeLastHit({
    version: 1,
    ...cue.source,
    damage: game.run.damageTaken - cue.damageTakenBefore,
    hpBefore: cue.hpBefore,
  });
}

export function lastHitReadout(raw) {
  const hit = normalizeLastHit(raw);
  if (!hit) return null;
  const name = hit.enemy
    ? `${hit.elite ? "強敵・" : ""}${ENEMIES[hit.enemy].name}`
    : "";
  const titles = {
    contact: `${name}との接触`,
    charge: `${name}の突進`,
    projectile: name ? `${name}の弾` : "敵の弾",
    bloom: "硝子の芽",
    line: "灯台の断層",
    cord: `${name}の赤い結び`,
    stolen: "奪われた昨日の逆走",
    tide: "潮の横波",
    gardenShot: "修復前の種まき機の弾",
    furnaceShot: "炉の圧力弾",
    unknown: "届いた攻撃",
  };
  const hints = {
    contact: "身体から距離を取り、近づく影へ光糸を張る。",
    charge: "狙いが固定されたら、予告の帯から横へ回避する。",
    projectile: "弾の列から横へ移動する。残響との光糸でも受け止められる。",
    bloom: "芽の輪から離れる。開く前に光糸を重ねて摘むこともできる。",
    line: "光る断層の外へ移動する。回避で線を越える。",
    cord: "赤い結びから離れ、光糸を重ねるか残響の解放で切る。",
    stolen: "赤い逆走の道から離れ、光糸か解放で昨日を奪い返す。",
    tide: "光糸で灯器を直すと、波を避ける通り道ができる。横波は回避でもすり抜けられる。",
    gardenShot: "光糸で種まき機を修復すると、敵へ向かう弾に変わる。",
    furnaceShot: "射撃で上がる熱を、残響の射撃と光糸で冷ます。",
    unknown: "間合いを取り、残響との光糸を保ちながら予告を読む。",
  };
  return { ...hit, title: titles[hit.type], hint: hints[hit.type] };
}
