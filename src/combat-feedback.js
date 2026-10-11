import { clamp } from "./math.js";
import { impactSource } from "./last-impact.js";

export const IMPACT_DURATION = 0.75;

// Transient presentation state; it never enters the saved run or reward RNG.
export function recordImpact(game, source, hpBefore, kind = "hurt") {
  const dx = source?.x - game.player.x;
  const dy = source?.y - game.player.y;
  game.hitCue = {
    kind,
    hpBefore,
    source: impactSource(game, source),
    damageTakenBefore: game.run.damageTaken,
    angle:
      Number.isFinite(dx + dy) && Math.hypot(dx, dy) > 0.01
        ? Math.atan2(dy, dx)
        : null,
    age: 0,
    duration: IMPACT_DURATION,
  };
}

export function advanceImpact(game, dt) {
  if (!game.hitCue) return;
  game.hitCue.age += dt;
  if (game.hitCue.age >= game.hitCue.duration) game.hitCue = null;
}

export function healthTrailPercent(game) {
  const { hp, maxHp } = game.run;
  const cue = game.hitCue;
  const remaining =
    cue?.kind === "hurt" ? 1 - clamp((cue.age - 0.25) / 0.5, 0, 1) : 0;
  const shown = hp + Math.max(0, (cue?.hpBefore ?? hp) - hp) * remaining;
  return clamp((shown / Math.max(1, maxHp)) * 100, 0, 100);
}

export function bossTelegraph(boss) {
  if (
    boss?.state !== "windup" ||
    !Number.isFinite(boss.plan?.windup) ||
    boss.plan.windup <= 0 ||
    !Number.isFinite(boss.timer)
  )
    return null;
  const remaining = clamp(boss.timer, 0, boss.plan.windup);
  return {
    progress: 1 - remaining / boss.plan.windup,
    remainingSeconds: Math.ceil(remaining * 10) / 10,
  };
}
