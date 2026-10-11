import { distance } from "./math.js";

export const BELL_RADIUS = 38;
export const BELL_SECONDS_PER_BULLET = 0.3;
export const BELL_MAX_RECOVERY = 0.9;
export const BELL_PULSE_DURATION = 0.32;
export const weavesBell = (run) =>
  run.relic === "bell" && run.bellVersion === 2;
export const bellSeconds = (value) =>
  value > 0 && value < 0.05 ? "<0.1" : value.toFixed(1);
export function bellRelicDescription(run, description) {
  return run.relic === "bell" && !weavesBell(run)
    ? "回避時に周囲の弾を消去。危険をすり抜ける。"
    : description;
}

// The original bell clears at the departure point. Recovery applies only to
// the next missing charge; full charges never bank time for a later cast.
export function ringBell(game) {
  const p = game.player;
  const before = game.bullets.length;
  game.bullets = game.bullets.filter(
    (b) => b.friendly || distance(b, p) > BELL_RADIUS,
  );
  const cuts = before - game.bullets.length;
  const recovered =
    p.echoCharges < game.stats.echoes && p.echoCd > 0
      ? Math.min(p.echoCd, cuts * BELL_SECONDS_PER_BULLET, BELL_MAX_RECOVERY)
      : 0;
  p.echoCd = Math.max(0, p.echoCd - recovered);
  game.run.bellCuts += cuts;
  game.run.bellRecovered += recovered;
  game.bellPulse = {
    x: p.x,
    y: p.y,
    age: 0,
    duration: BELL_PULSE_DURATION,
    cuts,
    recovered,
  };
  if (cuts) game.sound("bell");
  if (recovered)
    game.label(p.x, p.y - 24, `鈴 −${bellSeconds(recovered)}秒`, "#f4dba6");
}

export function advanceBell(game, dt) {
  if (!game.bellPulse) return;
  game.bellPulse.age += dt;
  if (game.bellPulse.age >= game.bellPulse.duration) delete game.bellPulse;
}
