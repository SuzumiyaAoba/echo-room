export const NEEDLE_STITCH = Object.freeze({
  seconds: 1.2,
  limit: 3,
  bonus: 0.5,
  cueSeconds: 0.25,
});

export function needleMarks(enemy, now) {
  return (enemy.needleMarks || []).filter((mark) => mark.until > now);
}

// Only the recorded weapon shot can complete a mark. Returned lights and
// other friendly projectiles keep their own rules, even when they are echoes.
export function takeNeedleMark(enemy, bullet, now) {
  if (!bullet.needle || !bullet.echo || bullet.returnedLight) return 0;
  const marks = needleMarks(enemy, now);
  const mark = marks.shift();
  enemy.needleMarks = marks;
  return mark ? mark.damage * NEEDLE_STITCH.bonus : 0;
}

export function recordNeedleHit(game, enemy, bullet, damage, bonus) {
  if (!bullet.needle || bullet.returnedLight || damage <= 0) return;
  if (!bullet.echo && enemy.hp > 0) {
    const marks = needleMarks(enemy, game.t);
    marks.push({ until: game.t + NEEDLE_STITCH.seconds, damage });
    enemy.needleMarks = marks.slice(-NEEDLE_STITCH.limit);
  }
  if (bonus <= 0) return;
  game.run.needleStitches = (game.run.needleStitches || 0) + 1;
  enemy.needleCueUntil = game.t + NEEDLE_STITCH.cueSeconds;
  game.effect(enemy.x, enemy.y - 4, "spark", "#b9edd0", 6);
  game.sound("stitch");
  if (!game.stitchAnnounced) {
    game.stitchAnnounced = true;
    game.label(enemy.x, enemy.y - enemy.r - 24, "合わせ縫い", "#b9edd0");
    game.onEvent("stitch");
  }
}
