import { advanceImpact } from "./combat-feedback.js";
import { advanceDefeats } from "./defeat-weave.js";
import { advanceBell } from "./bell-weave.js";

// Presentation continues after combat stops; run and room clocks do not.
export function advanceWorldEffects(game, dt) {
  game.t += dt;
  advanceImpact(game, dt);
  advanceDefeats(game, dt);
  advanceBell(game, dt);
  game.shake = Math.max(0, game.shake - dt * 18);
  game.flash = Math.max(0, game.flash - dt * 3);
  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
  for (const l of game.labels) {
    l.y -= dt * 9;
    l.life -= dt;
  }
  game.labels = game.labels.filter((l) => l.life > 0);
}
