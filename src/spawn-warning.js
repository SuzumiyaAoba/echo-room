import { ENEMIES } from "./content.js";

export const SPAWN_WARNING_TIME = 0.85;

// Read the scheduled arrival; never advance the queue or the battle clock.
export function spawnWarning(arrival, roomTime) {
  const enemy = ENEMIES[arrival?.kind];
  if (
    !enemy ||
    ![arrival.x, arrival.y, arrival.time, roomTime].every(Number.isFinite)
  )
    return null;
  const remaining = arrival.time - roomTime;
  if (remaining <= 0 || remaining >= SPAWN_WARNING_TIME) return null;
  const boss = !!enemy.boss,
    elite = !!arrival.elite && !boss,
    radius = enemy.radius + (elite ? 2 : 0),
    x = Math.round(arrival.x),
    y = Math.round(arrival.y),
    progress = 1 - remaining / SPAWN_WARNING_TIME,
    half = radius + 4;
  return {
    kind: arrival.kind,
    x,
    y,
    boss,
    elite,
    color: enemy.color,
    scale: boss ? 1.7 : elite ? 1.25 : 1,
    progress,
    ticks: Math.min(4, Math.floor(progress * 4) + 1),
    bounds: {
      left: x - half - 2,
      right: x + half + 2,
      top: y - radius - (boss ? 12 : 8) - 2,
      bottom: y + 16,
    },
  };
}

export function spawnWarnings(game) {
  if (game.mode !== "combat") return [];
  return game.spawnQueue
    .map((arrival) => spawnWarning(arrival, game.roomTime))
    .filter(Boolean);
}
