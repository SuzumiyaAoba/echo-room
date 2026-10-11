import { distance, segmentDistance, segmentPairDistance } from "./math.js";
import { ENEMIES } from "./content.js";

const FPS = 120;
const live = (h) => !h.cancelled && h.age < h.duration && h.owner.hp > 0;

export function stealEcho(game, owner) {
  if (
    game.history.length < 24 ||
    game.hazards.some((h) => h.kind === "stolenEcho" && live(h))
  )
    return false;
  // Copy the actual recorded route. Later movement cannot retarget the warning.
  const frames = game.history.map((f) => ({ ...f })).reverse();
  const first = frames[0];
  const warning = 0.95;
  game.hazards.push({
    kind: "stolenEcho",
    owner,
    frames,
    ...first,
    r: game.player.r,
    age: 0,
    warning,
    duration: warning + (frames.length - 1) / FPS + 0.2,
    damage: ENEMIES.weaver.damage,
    hit: false,
  });
  owner.state = "steal";
  if (!game.run.memoryCuts && !game.stolenAnnounced) {
    game.stolenAnnounced = true;
    game.onEvent("stolenecho");
  }
  game.sound("warning");
  return true;
}

export function stolenPosition(h, age = h.age) {
  const index = Math.max(
    0,
    Math.min(h.frames.length - 1, (age - h.warning) * FPS),
  );
  const from = h.frames[Math.floor(index)],
    to = h.frames[Math.ceil(index)],
    fraction = index % 1;
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    walk: from.walk || 0,
    moving: from.moving,
    angle: from.angle,
    index,
  };
}

// Keep every recorded bend, including a dash around a corner. Do not replace
// the route by a straight chord that could cut through walls or hit elsewhere.
export function stolenSegments(h, fromAge, toAge) {
  const from = stolenPosition(h, fromAge),
    to = stolenPosition(h, toAge);
  const points = [from];
  for (let i = Math.floor(from.index) + 1; i <= Math.floor(to.index); i++)
    points.push(h.frames[i]);
  points.push(to);
  return points.slice(1).map((point, i) => [points[i], point]);
}

export function reclaimEcho(game, h, source = "thread") {
  if (game.mode === "dead" || !live(h)) return false;
  h.cancelled = true;
  game.run.memoryCuts = (game.run.memoryCuts || 0) + 1;
  game.damageEnemy(h.owner, 16, source);
  if (h.owner.hp > 0) {
    h.owner.state = "recover";
    h.owner.timer = 0.65;
    h.owner.slow = 0.8;
  }
  game.effect(h.x, h.y, "echo", "#b8f2d7", 18);
  game.label(h.x, h.y - 17, "昨日を奪い返した", "#b8f2d7");
  game.sound("unweave");
  return true;
}

export function updateStolenEcho(game, h, dt, threads) {
  if (!live(h)) {
    h.cancelled = true;
    return;
  }
  Object.assign(h, stolenPosition(h));
  if (h.age < h.warning) return;
  const swept = stolenSegments(h, Math.max(h.warning, h.age - dt), h.age);
  if (
    threads.some(
      ([a, b]) =>
        distance(a, b) > 20 &&
        swept.some(
          ([c, d]) =>
            segmentPairDistance(a, b, c, d) < game.stats.threadWidth + h.r,
        ),
    )
  ) {
    reclaimEcho(game, h);
    return;
  }
  if (
    !h.hit &&
    swept.some(
      ([a, b]) => segmentDistance(game.player, a, b) < game.player.r + h.r,
    )
  ) {
    h.hit = true;
    game.hurt(h.damage, h);
  }
}

export function releaseStolenEchoes(game, echo, radius) {
  for (const h of game.hazards)
    if (h.kind === "stolenEcho" && live(h) && distance(h, echo) < radius + h.r)
      reclaimEcho(game, h, "burst");
}
