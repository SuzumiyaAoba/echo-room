import { clamp } from "./math.js";

export const ENEMY_HEALTH_COLORS = {
  border: "#09151b",
  track: "#35484f",
  trail: "#8c7870",
  health: "#e5ce9a",
  low: "#f3a58b",
};

export function enemyHealthBounds(enemy) {
  return {
    x: clamp(Math.round(enemy.x) - 12, 2, 454),
    y: clamp(Math.round(enemy.y - enemy.r) - 18, 2, 293),
    width: 24,
    height: 5,
  };
}

export function drawEnemyHealth(c, enemy, health) {
  if (!health) return;
  const { x, y, width, height } = enemyHealthBounds(enemy);
  const fill = Math.max(1, Math.ceil(health.fraction * 22));
  const trail = Math.max(fill, Math.ceil(health.trailFraction * 22));
  c.save();
  c.globalAlpha = 1;
  c.fillStyle = ENEMY_HEALTH_COLORS.border;
  c.fillRect(x, y, width, height);
  c.fillStyle = ENEMY_HEALTH_COLORS.track;
  c.fillRect(x + 1, y + 1, 22, 3);
  c.fillStyle = ENEMY_HEALTH_COLORS.trail;
  c.fillRect(x + 1, y + 1, trail, 3);
  c.fillStyle = health.low
    ? ENEMY_HEALTH_COLORS.low
    : ENEMY_HEALTH_COLORS.health;
  c.fillRect(x + 1, y + 1, fill, 3);
  // The last quarter is also a stepped notch, so colour alone is not needed.
  if (health.low) {
    c.fillStyle = ENEMY_HEALTH_COLORS.border;
    c.fillRect(x + fill, y + 1, 1, 1);
  }
  c.restore();
}
