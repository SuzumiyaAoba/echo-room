import { distance } from "./math.js";
import { storeThreadLight, STORED_LIGHT_LIMIT } from "./counter-thread.js";

// Leave each body's end of the thread open. Wider weaving protects more space
// between the actors, rather than making an overlapping echo a body shield.
export function threadGuardSegments(game) {
  const width = game.stats.threadWidth;
  return game.threads().flatMap(([a, b]) => {
    const length = distance(a, b);
    const margin = width + Math.max(a.r || 5, b.r || 5) + 4;
    if (length <= margin * 2 + 1) return [];
    const dx = (b.x - a.x) / length,
      dy = (b.y - a.y) / length;
    return [
      {
        a: { x: a.x + dx * margin, y: a.y + dy * margin },
        b: { x: b.x - dx * margin, y: b.y - dy * margin },
        holders: [a, b].filter((actor) => actor !== game.player),
      },
    ];
  });
}

export function unravelThreadBullet(game, bullet, guard) {
  if (bullet.friendly || bullet.threadGuarded || game.mode === "dead")
    return false;
  bullet.threadGuarded = true;
  bullet.life = 0;
  game.run.threadCuts = (game.run.threadCuts || 0) + 1;
  const stored = storeThreadLight(game, bullet, guard);
  game.hazards.push({
    kind: "threadGuard",
    x: bullet.x,
    y: bullet.y,
    r: 6,
    age: 0,
    duration: 0.32,
    friendly: true,
  });
  game.effect(bullet.x, bullet.y, "spark", "#b6f4dc", 5);
  if (game.t - (game.lastThreadGuardCue ?? -1) > 0.12) {
    game.lastThreadGuardCue = game.t;
    game.label(
      bullet.x,
      bullet.y - 12,
      stored ? `蓄え ${stored.returnStock}/${STORED_LIGHT_LIMIT}` : "ほどき",
      stored ? "#f3d69a" : "#b6f4dc",
    );
    game.sound("threadguard");
  }
  return true;
}
