const dotThreshold = 0.3;

// The displayed boundary and actual shot reduction share the original rule.
export const SHIELD_GUARD = Object.freeze({
  dotThreshold,
  damageScale: 0.25,
  halfAngle: Math.acos(dotThreshold),
});

export function shieldGuard(enemy) {
  if (
    enemy?.kind !== "shield" ||
    ![enemy.x, enemy.y, enemy.r, enemy.angle, enemy.hp].every(
      Number.isFinite,
    ) ||
    enemy.hp <= 0 ||
    enemy.r <= 0
  )
    return null;
  return {
    x: enemy.x,
    y: enemy.y,
    angle: enemy.angle,
    radius: enemy.r + 4,
    halfAngle: SHIELD_GUARD.halfAngle,
  };
}
