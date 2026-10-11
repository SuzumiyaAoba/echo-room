import { BELL_RADIUS } from "./bell-weave.js";

export function drawBell(c, game, settings) {
  const pulse = game.bellPulse;
  if (!pulse) return;
  const progress = Math.min(1, pulse.age / pulse.duration);
  c.save();
  c.globalAlpha = (1 - progress) * (pulse.cuts ? 0.9 : 0.45);
  c.fillStyle = pulse.recovered
    ? "#f4dba6"
    : pulse.cuts
      ? "#dceee4"
      : "#83bcb9";
  // A quiet, one-pixel boundary marks the actual departure-point radius.
  // No expanding flash, canvas stroke, random particle or rendering clock.
  let lastX, lastY;
  for (let i = 0; i <= 240; i++) {
    const angle = (i * Math.PI * 2) / 240;
    const x = Math.round(pulse.x + Math.cos(angle) * BELL_RADIUS);
    const y = Math.round(pulse.y + Math.sin(angle) * BELL_RADIUS);
    if (x !== lastX || y !== lastY) c.fillRect(x, y, 1, 1);
    lastX = x;
    lastY = y;
  }
  if (pulse.recovered && settings.flashes) {
    c.fillStyle = "#fff0c3";
    c.fillRect(Math.round(pulse.x) - 1, Math.round(pulse.y) - 2, 3, 4);
  }
  c.restore();
}
