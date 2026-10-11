import { clamp, distance } from "./math.js";

export const CHARGER_ATTACK = Object.freeze({
  speed: 215,
  seconds: 0.7,
  windup: 0.8,
  stalledDistance: 0.5,
});

// The warning follows the same fixed-frame X/Y collision queries as the
// attack, on a local body. It never moves an actor or advances the game.
export function chargerWarning(game, enemy) {
  if (
    game?.mode !== "combat" ||
    game.run.chargeVersion !== 1 ||
    enemy?.kind !== "charger" ||
    enemy.state !== "windup" ||
    enemy.hp <= 0 ||
    ![
      enemy.x,
      enemy.y,
      enemy.r,
      enemy.angle,
      enemy.timer,
      enemy.hp,
      game.player?.r,
    ].every(Number.isFinite) ||
    enemy.r <= 0 ||
    game.player.r < 0
  )
    return null;
  const body = { x: enemy.x, y: enemy.y, r: enemy.r },
    path = [{ x: body.x, y: body.y }],
    dt = 1 / 60,
    dx = Math.cos(enemy.angle) * CHARGER_ATTACK.speed * dt,
    dy = Math.sin(enemy.angle) * CHARGER_ATTACK.speed * dt;
  for (let timer = CHARGER_ATTACK.seconds; timer > 0; timer -= dt) {
    const previous = { x: body.x, y: body.y };
    if (!game.solid(body.x + dx, body.y, body.r)) body.x += dx;
    if (!game.solid(body.x, body.y + dy, body.r)) body.y += dy;
    path.push({ x: body.x, y: body.y });
    if (distance(previous, body) < CHARGER_ATTACK.stalledDistance) break;
  }
  return {
    path,
    radius: enemy.r + game.player.r + 1,
    progress: clamp(1 - enemy.timer / CHARGER_ATTACK.windup, 0, 1),
  };
}

// A charger holds its aim and position during the warning and attack.
// Crowded enemies can separate themselves, without pushing this locked lane.
export function chargerHoldsLane(game, enemy) {
  return (
    game.run.chargeVersion === 1 &&
    enemy.kind === "charger" &&
    (enemy.state === "windup" || enemy.state === "charge")
  );
}
