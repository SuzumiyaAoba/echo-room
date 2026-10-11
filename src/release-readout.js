import { distance } from "./math.js";

// Read the actual explosion rules without advancing or changing the battle.
// Overlapping echoes may damage one enemy repeatedly; this counts recipients.
export function releaseReadout(game) {
  const radius = game?.stats?.burstRadius;
  const echoes = (game?.echoes || []).filter(
    (e) => Number.isFinite(e.x) && Number.isFinite(e.y),
  );
  const active =
    ["combat", "cleared"].includes(game?.mode) &&
    Number.isFinite(radius) &&
    radius > 0 &&
    echoes.length > 0;
  if (!active) return { active: false, enemies: 0, bullets: 0 };
  const reached = (object, extra) =>
    Number.isFinite(object.x) &&
    Number.isFinite(object.y) &&
    Number.isFinite(extra) &&
    extra >= 0 &&
    echoes.some((echo) => distance(object, echo) < radius + extra);
  let enemies = 0,
    bullets = 0;
  for (const enemy of game.enemies)
    if (enemy.hp > 0 && reached(enemy, enemy.r)) enemies++;
  for (const bullet of game.bullets)
    if (!bullet.friendly && bullet.life > 0 && reached(bullet, 0)) bullets++;
  return { active: true, enemies, bullets };
}

export function releaseLabel(readout) {
  return `影 ${readout.enemies} / 弾 ${readout.bullets}`;
}

export function releaseDescription(readout) {
  return `解放の爆発が届く影 ${readout.enemies}体、消せる敵弾 ${readout.bullets}発`;
}
