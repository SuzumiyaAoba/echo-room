import { distance, angleTo } from "./math.js";

// Movement, shooting and recording precede echo playback and enemy attacks.
// Calls remain on Game so the practice room shares the same player mechanics.
export function updatePlayer(game, dt, input) {
  const p = game.player,
    s = game.stats;
  for (const key of ["invulnerable", "dashCd", "echoCd", "fireCd", "dash"])
    p[key] = Math.max(0, p[key] - dt);
  if (p.echoCharges < s.echoes && p.echoCd === 0) {
    p.echoCharges++;
    if (p.echoCharges < s.echoes) p.echoCd = s.echoCooldown;
  }
  let mx = input.mx || 0,
    my = input.my || 0;
  const length = Math.hypot(mx, my);
  if (length > 1) {
    mx /= length;
    my /= length;
  }
  if (length > 0.1) {
    p.dx = mx / (length || 1);
    p.dy = my / (length || 1);
  }
  if (Number.isFinite(input.angle)) p.angle = input.angle;
  if (input.autoAim && game.enemies.length) {
    const closest = game.enemies.reduce((a, b) =>
      distance(a, p) < distance(b, p) ? a : b,
    );
    p.angle = angleTo(p, closest);
  }
  if (input.dash && p.dashCd === 0) game.dash(mx, my);
  const beforeMove = { x: p.x, y: p.y };
  game.dashThreadOrigin = p.dash > 0 ? beforeMove : null;
  if (p.dash > 0) {
    game.move(p, p.dashX * 290 * dt, p.dashY * 290 * dt);
    if (Math.floor(game.t * 60) % 3 === 0)
      game.effect(p.x, p.y, "dash", "#9ce8d3", 2);
  } else game.move(p, mx * s.speed * dt, my * s.speed * dt);
  const travelled = distance(beforeMove, p);
  p.moving = travelled > 0.1;
  p.walk += travelled / 6;
  let fired = false;
  if (input.fire && p.fireCd === 0 && game.mode === "combat") {
    game.shoot(p, p.angle, false);
    p.fireCd = game.weapon.rate / s.fireRate;
    fired = true;
  }
  game.history.push({
    x: p.x,
    y: p.y,
    angle: p.angle,
    fire: fired,
    walk: p.walk,
    moving: p.moving,
  });
  if (game.history.length > 216) game.history.shift();
  if (input.echo && p.echoCharges > 0 && game.history.length >= 24)
    game.castEcho();
  if (input.burst && game.echoes.length) game.release();
}
