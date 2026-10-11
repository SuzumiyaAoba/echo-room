import { ENEMIES } from "./content.js";

export const DEFEAT_LIMIT = 24;
export const DEFEAT_SECONDS = Object.freeze({ enemy: 0.45, boss: 0.7 });

// A short, detached picture of the defeated enemy. No actor, reward or RNG
// participates in its lifetime; the normal room clock also pauses this cue.
export function recordDefeat(game, enemy, source) {
  const data = ENEMIES[enemy.kind];
  if (!data || enemy.practiceTarget) return;
  const boss = !!data.boss;
  const cue = {
    kind: enemy.kind,
    x: enemy.x,
    y: enemy.y,
    scale: boss ? 1.7 : enemy.elite ? 1.25 : 1,
    walk: game.t * 5,
    boss,
    source,
    color:
      source === "thread" || source === "echo"
        ? "#a9f0d0"
        : source === "burst"
          ? "#8cf1d7"
          : data.color,
    age: 0,
    duration: boss ? DEFEAT_SECONDS.boss : DEFEAT_SECONDS.enemy,
  };
  game.defeats.push(cue);
  if (game.defeats.length > DEFEAT_LIMIT)
    game.defeats.splice(0, game.defeats.length - DEFEAT_LIMIT);
}

export function advanceDefeats(game, dt) {
  for (const cue of game.defeats) cue.age += dt;
  game.defeats = game.defeats.filter((cue) => cue.age < cue.duration);
}
