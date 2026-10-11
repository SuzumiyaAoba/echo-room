import { distance } from "./math.js";

// Earliest contact along a swept circle. Broad rejection avoids a square root
// for distant actors, including in dense rooms.
export function circleHitTime(from, to, center, radius) {
  if (
    center.x < Math.min(from.x, to.x) - radius ||
    center.x > Math.max(from.x, to.x) + radius ||
    center.y < Math.min(from.y, to.y) - radius ||
    center.y > Math.max(from.y, to.y) + radius
  )
    return null;
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const fx = from.x - center.x,
    fy = from.y - center.y;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = fx * dx + fy * dy;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const time = (-b - Math.sqrt(discriminant)) / a;
  return time >= 0 && time <= 1 ? time : null;
}

// A swept bullet touches a thread's capsule at its earliest contact. The
// rectangle in thread-local coordinates and the two end circles cover it
// exactly, including fast crossings, tangents and a stationary projectile.
export function capsuleHitTime(from, to, a, b, radius) {
  if (
    Math.max(from.x, to.x) < Math.min(a.x, b.x) - radius ||
    Math.min(from.x, to.x) > Math.max(a.x, b.x) + radius ||
    Math.max(from.y, to.y) < Math.min(a.y, b.y) - radius ||
    Math.min(from.y, to.y) > Math.max(a.y, b.y) + radius
  )
    return null;
  const length = distance(a, b);
  if (length < 1e-9) return circleHitTime(from, to, a, radius);
  const ux = (b.x - a.x) / length,
    uy = (b.y - a.y) / length;
  const fx = from.x - a.x,
    fy = from.y - a.y;
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const origin = [fx * ux + fy * uy, -fx * uy + fy * ux];
  const travel = [dx * ux + dy * uy, -dx * uy + dy * ux];
  const bounds = [
    [0, length],
    [-radius, radius],
  ];
  let entry = 0,
    exit = 1,
    inside = true;
  for (let axis = 0; axis < 2; axis++) {
    const [low, high] = bounds[axis];
    if (Math.abs(travel[axis]) < 1e-12) {
      if (origin[axis] < low || origin[axis] > high) inside = false;
    } else {
      const first = (low - origin[axis]) / travel[axis];
      const last = (high - origin[axis]) / travel[axis];
      entry = Math.max(entry, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
    }
  }
  const times = [
    circleHitTime(from, to, a, radius),
    circleHitTime(from, to, b, radius),
  ];
  if (inside && entry <= exit) times.push(entry);
  const contacts = times.filter((time) => time !== null);
  return contacts.length ? Math.min(...contacts) : null;
}

export function wallHitTime(game, from, to, radius) {
  if (game.solid(from.x, from.y, radius)) return 0;
  const steps = Math.max(1, Math.ceil(distance(from, to) / 4));
  const at = (time) => ({
    x: from.x + (to.x - from.x) * time,
    y: from.y + (to.y - from.y) * time,
  });
  for (let i = 1; i <= steps; i++) {
    const point = at(i / steps);
    if (!game.solid(point.x, point.y, radius)) continue;
    let low = (i - 1) / steps,
      high = i / steps;
    for (let j = 0; j < 6; j++) {
      const mid = (low + high) / 2,
        p = at(mid);
      if (game.solid(p.x, p.y, radius)) high = mid;
      else low = mid;
    }
    return high;
  }
  return null;
}

export function shotEvents(game, bullet, from, to, guards = null) {
  const events = [];
  const wall = wallHitTime(game, from, to, bullet.r);
  if (wall !== null) events.push({ kind: "wall", time: wall, priority: 0 });
  if (bullet.friendly) {
    for (const enemy of game.enemies) {
      if (enemy.hp <= 0 || bullet.hit.includes(enemy.id)) continue;
      const time = circleHitTime(from, to, enemy, enemy.r + bullet.r);
      if (time !== null)
        events.push({ kind: "enemy", time, priority: 1, enemy });
    }
    if (bullet.prismatic && !bullet.refracted)
      for (const echo of game.echoes) {
        // A shot cannot split in the body that fired it, or in overlapping
        // copies at birth. Only crossing another, separated yesterday counts.
        if (distance(bullet.origin, echo) <= 20) continue;
        const time = circleHitTime(from, to, echo, (echo.r || 5) + 6);
        if (time !== null)
          events.push({ kind: "lens", time, priority: 2, echo });
      }
  } else {
    const time = circleHitTime(from, to, game.player, game.player.r + bullet.r);
    if (time !== null) events.push({ kind: "player", time, priority: 1 });
    for (const guard of guards || game.threadGuards()) {
      const { a, b } = guard;
      const time = capsuleHitTime(
        from,
        to,
        a,
        b,
        game.stats.threadWidth + bullet.r,
      );
      if (time !== null)
        events.push({ kind: "thread", time, priority: 2, guard });
    }
  }
  return events.sort((a, b) => a.time - b.time || a.priority - b.priority);
}

export function refractShot(game, bullet, remainingLife) {
  if (bullet.refracted || game.mode === "dead" || remainingLife <= 0) return;
  bullet.refracted = true;
  game.run.prismSplits = (game.run.prismSplits || 0) + 1;
  for (const side of [-1, 1]) {
    const ray = game.makeBullet(
      bullet,
      bullet.angle + (side * Math.PI) / 9,
      bullet.damage * 0.3,
      Math.hypot(bullet.vx, bullet.vy) * 0.9,
      true,
      side < 0 ? "#c6b7f4" : "#9de8db",
      0,
      bullet.echo,
      bullet.critical,
    );
    ray.life = remainingLife;
    ray.fragment = true;
    ray.trail = 0.05;
  }
  game.hazards.push({
    kind: "refraction",
    x: bullet.x,
    y: bullet.y,
    r: 10,
    age: 0,
    duration: 0.25,
    friendly: true,
  });
  game.effect(bullet.x, bullet.y, "spark", "#d9d7ff", 8);
  game.label(bullet.x, bullet.y - 15, "分光", "#d9d7ff");
  game.sound("prism");
  if (!game.prismAnnounced) {
    game.prismAnnounced = true;
    game.onEvent("refraction");
  }
}
