import { clamp } from "./math.js";

// These read the simulation clock. Pausing never consumes a displayed lifetime,
// and inspecting the HUD does not advance combat, recordings, saves, or RNG.
const tenth = (seconds) =>
  seconds > 0 ? Math.max(0.1, Math.ceil(seconds * 10 - 1e-7) / 10) : 0;

export function echoLifetime(echo, duration) {
  if (
    !Number.isFinite(echo.elapsed) ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return null;
  const remaining = clamp(duration - echo.elapsed, 0, duration);
  if (remaining <= 0) return null;
  return {
    remaining,
    seconds: tenth(remaining),
    fraction: remaining / duration,
    urgent: remaining <= 1,
  };
}

export function echoReadout(game) {
  const { player, stats, echoes, history } = game;
  const charges = clamp(player.echoCharges, 0, stats.echoes);
  const next = charges < stats.echoes ? Math.max(0, player.echoCd) : 0;
  let shortest = null;
  for (const echo of echoes) {
    const life = echoLifetime(echo, stats.echoDuration);
    if (life && (!shortest || life.remaining < shortest.remaining))
      shortest = life;
  }
  return {
    charges,
    capacity: stats.echoes,
    recording: history.length < 24,
    nextSeconds: tenth(next),
    chargingFraction:
      charges < stats.echoes ? clamp(1 - next / stats.echoCooldown, 0, 1) : 0,
    shortest,
  };
}
