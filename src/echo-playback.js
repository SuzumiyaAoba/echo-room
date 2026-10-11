import { CATALOG_VERSION, rank } from "./content.js";

export const rewindsEchoes = (run) =>
  run?.catalogVersion === CATALOG_VERSION && rank(run, "rewind") > 0;

// The same order is used by the floor preview and the actual cast. Recorded
// aim and shot events retain their positions and direction, exactly once.
// Reordering never edits the live history or consumes combat randomness.
export function echoPlaybackFrames(run, history) {
  return rewindsEchoes(run) ? history.slice().reverse() : history;
}

// Advance only recorded frames. Even a large step plays each shot once.
export function updateEchoes(game, dt) {
  for (const e of game.echoes) {
    e.elapsed += dt;
    const idx = Math.min(
      e.frames.length - 1,
      Math.max(0, Math.floor(e.elapsed * 60 + 1e-6) - 1),
    );
    const f = e.frames[idx];
    e.x = f.x;
    e.y = f.y;
    e.angle = f.angle;
    e.walk = f.walk;
    e.moving = e.elapsed < e.frames.length / 60 && f.moving;
    for (let i = e.frame + 1; i <= idx; i++)
      if (e.frames[i].fire) game.shoot(e, e.frames[i].angle, true);
    e.frame = idx;
  }
  const expired = game.echoes.filter(
    (e) => e.elapsed >= game.stats.echoDuration,
  );
  for (const e of expired) game.effect(e.x, e.y, "echo", "#71decd", 10);
  game.echoes = game.echoes.filter((e) => e.elapsed < game.stats.echoDuration);
}
