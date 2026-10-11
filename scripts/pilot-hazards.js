import { distance, segmentDistance } from "../src/math.js";
import { stolenSegments } from "../src/stolen-echo.js";

// React only to the visible warning and its fixed, displayed route.
export function hazardDanger(h, player, horizon = 0.25) {
  if (h.friendly || h.cancelled) return false;
  if (h.kind === "stolenEcho") {
    if (h.owner.hp <= 0 || h.hit || h.age + horizon < h.warning) return false;
    return stolenSegments(h, Math.max(h.age, h.warning), h.age + horizon).some(
      ([a, b]) => segmentDistance(player, a, b) < h.r + 12,
    );
  }
  if (h.age <= (h.kind === "cord" ? h.warning - 0.35 : h.duration - 0.7))
    return false;
  return (
    (h.kind === "cord"
      ? segmentDistance(player, h.a, h.b)
      : h.kind === "line"
        ? Math.abs(h.axis === "v" ? player.x - h.x : player.y - h.y)
        : distance(player, h)) <
    h.r + 12
  );
}

export function canReleaseCounter(game, echo) {
  return game.hazards.some(
    (h) =>
      h.kind === "stolenEcho" &&
      !h.cancelled &&
      h.owner.hp > 0 &&
      h.age < h.duration &&
      distance(h, echo) < game.stats.burstRadius + h.r,
  );
}
