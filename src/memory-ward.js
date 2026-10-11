import { clamp } from "./math.js";

export const WARD_WEAVE_TIME = 0.65;
export const WARD_OPEN_TIME = 3;

export function advanceMemoryWard(enemy, dt) {
  if (enemy.kind !== "heart") return;
  const remaining = (enemy.wardOpen || 0) - dt;
  enemy.wardOpen = remaining > 1e-7 ? remaining : 0;
  enemy.ward = Math.floor(enemy.age / 5) % 2 === 0 && enemy.wardOpen === 0;
  if (!enemy.ward) enemy.wardWeave = 0;
}

export function openMemoryWard(game, enemy) {
  if (
    game.mode !== "combat" ||
    enemy.kind !== "heart" ||
    enemy.hp <= 0 ||
    !enemy.ward
  )
    return false;
  enemy.ward = false;
  enemy.wardWeave = 0;
  enemy.wardOpen = WARD_OPEN_TIME;
  game.label(enemy.x, enemy.y - enemy.r - 12, "記憶の盾をほどいた", "#f2d89d");
  game.effect(enemy.x, enemy.y - 6, "echo", "#e9d69b", 12);
  game.sound("unweave");
  return true;
}

export function weaveMemoryWard(game, enemy, dt, connected) {
  if (
    game.mode !== "combat" ||
    enemy.kind !== "heart" ||
    enemy.hp <= 0 ||
    !enemy.ward
  )
    return false;
  enemy.wardWeave = clamp(
    (enemy.wardWeave || 0) + (connected ? dt : -dt * 2),
    0,
    WARD_WEAVE_TIME,
  );
  return enemy.wardWeave >= WARD_WEAVE_TIME && openMemoryWard(game, enemy);
}

// Read the simulation clock without advancing the shield, save, or reward RNG.
export function memoryWardReadout(enemy) {
  if (enemy?.kind !== "heart" || enemy.hp <= 0) return null;
  if (enemy.wardOpen > 0) {
    const seconds = Math.max(0.1, Math.ceil(enemy.wardOpen * 10 - 1e-7) / 10);
    return {
      state: "open",
      fraction: clamp(enemy.wardOpen / WARD_OPEN_TIME, 0, 1),
      text: `盾がほどけた · あと${seconds.toFixed(1)}秒`,
    };
  }
  if (enemy.ward) {
    const fraction = clamp((enemy.wardWeave || 0) / WARD_WEAVE_TIME, 0, 1);
    return {
      state: fraction ? "weaving" : "closed",
      fraction,
      text: fraction
        ? `盾をほどく ${Math.floor(fraction * 100)}% · 糸を保つ`
        : "記憶の盾 · 光糸か解放でほどく",
    };
  }
  return { state: "quiet", fraction: 0, text: "記憶の盾が休む · 射撃が通る" };
}
