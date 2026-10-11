import { clamp } from "./math.js";

export const ECHO_ARRIVAL_SECONDS = 0.35;

// Presentation reads the actual replay and release clocks. It never schedules
// damage, consumes charges, creates particles or draws a random number.
export function echoArrival(echo) {
  if (
    !Number.isFinite(echo.x + echo.y + echo.elapsed) ||
    echo.elapsed < 0 ||
    echo.elapsed >= ECHO_ARRIVAL_SECONDS
  )
    return null;
  return {
    x: echo.x,
    y: echo.y,
    progress: echo.elapsed / ECHO_ARRIVAL_SECONDS,
  };
}

export function releasePulse(hazard) {
  if (
    hazard.kind !== "pulse" ||
    !hazard.friendly ||
    hazard.cancelled ||
    !Number.isFinite(
      hazard.x + hazard.y + hazard.r + hazard.age + hazard.duration,
    ) ||
    hazard.r <= 0 ||
    hazard.duration <= 0 ||
    hazard.age < 0 ||
    hazard.age >= hazard.duration
  )
    return null;
  return {
    x: hazard.x,
    y: hazard.y,
    radius: hazard.r,
    progress: clamp(hazard.age / hazard.duration, 0, 1),
  };
}
