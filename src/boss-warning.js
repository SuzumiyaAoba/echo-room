import { clamp, distance } from "./math.js";
import { bossTelegraph } from "./combat-feedback.js";
import { FERRYMAN_CHARGE } from "./bosses.js";

// Read the damaging instant, rather than the end of its 0.35-second afterimage.
export function areaWarning(hazard) {
  if (
    !["bloom", "line"].includes(hazard?.kind) ||
    hazard.cancelled ||
    hazard.friendly ||
    !Number.isFinite(hazard.age) ||
    !Number.isFinite(hazard.duration) ||
    hazard.duration <= 0.35
  )
    return null;
  const warning = hazard.duration - 0.35;
  return {
    progress: clamp(hazard.age / warning, 0, 1),
    active: hazard.age > warning,
    afterimage: clamp((hazard.age - warning) / 0.35, 0, 1),
    weaveProgress: clamp((hazard.charge || 0) / 0.5, 0, 1),
  };
}

// The application advances combat at 1/60 second. Follow its separate X/Y
// collision queries on a local body; never move an enemy or advance combat.
export function chargePath(game, boss) {
  if (
    boss?.kind !== "ferryman" ||
    boss.state !== "windup" ||
    boss.plan?.kind !== "charge" ||
    ![boss.x, boss.y, boss.r, boss.angle].every(Number.isFinite)
  )
    return null;
  const body = { x: boss.x, y: boss.y, r: boss.r },
    path = [{ x: body.x, y: body.y }],
    dt = 1 / 60,
    dx = Math.cos(boss.angle) * FERRYMAN_CHARGE.speed * dt,
    dy = Math.sin(boss.angle) * FERRYMAN_CHARGE.speed * dt;
  for (let timer = FERRYMAN_CHARGE.seconds; timer > 0; timer -= dt) {
    const before = { x: body.x, y: body.y };
    if (!game.solid(body.x + dx, body.y, body.r)) body.x += dx;
    if (!game.solid(body.x, body.y + dy, body.r)) body.y += dy;
    path.push({ x: body.x, y: body.y });
    if (distance(before, body) < 0.2) break;
  }
  return path;
}

export function shotWarning(boss) {
  const timing = bossTelegraph(boss);
  if (!timing || boss.plan.kind === "charge") return null;
  return { ...timing, angles: boss.plan.angles || [] };
}
