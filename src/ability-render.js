import { TAU } from "./math.js";
import { pixelLine } from "./art.js";
import { echoArrival, releasePulse } from "./ability-feedback.js";

function arc(c, x, y, radius, start, end, color) {
  c.fillStyle = color;
  const steps = Math.max(1, Math.ceil((end - start) * radius * 1.5));
  let lastX, lastY;
  for (let i = 0; i <= steps; i++) {
    const angle = start + ((end - start) * i) / steps;
    const px = Math.round(x + Math.cos(angle) * radius);
    const py = Math.round(y + Math.sin(angle) * radius);
    if (px !== lastX || py !== lastY) c.fillRect(px, py, 1, 1);
    lastX = px;
    lastY = py;
  }
}

export function drawEchoArrival(c, echo, settings) {
  const cue = echoArrival(echo);
  if (!cue) return;
  const p = cue.progress;
  const close = settings.flashes ? 1 - (1 - p) ** 2 : 0.5;
  const rx = Math.round(21 - close * 8),
    ry = Math.round(10 - close * 4);
  const x = Math.round(cue.x),
    y = Math.round(cue.y) + 4;
  c.save();
  c.globalAlpha = (1 - p) * 0.8;
  // Four stitches close around the feet; the replaying body is drawn later.
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const cx = x + sx * rx,
        cy = y + sy * ry;
      pixelLine(c, cx - sx * 5, cy, cx, cy, "#8be7ce");
      pixelLine(c, cx, cy, cx, cy - sy * 3, "#8be7ce");
      c.fillStyle = "#c5eee0";
      c.fillRect(cx - sx, cy, 1, 1);
    }
  c.restore();
}

export function drawReleasePulse(c, hazard, settings) {
  const cue = releasePulse(hazard);
  if (!cue) return;
  const { x, y, radius, progress: p } = cue;
  const fade = 1 - p;
  const travel = 1 - (1 - p) ** 2;
  c.save();
  // Damage happened when R was pressed. Show the full real radius immediately;
  // the travelling inner threads are an afterimage, not an attack countdown.
  c.globalAlpha = fade * 0.55;
  for (let i = 0; i < 8; i++) {
    const angle = (i * TAU) / 8;
    arc(c, x, y, radius, angle - 0.26, angle + 0.26, "#76cdb6");
  }
  if (settings.flashes) {
    const inner = Math.min(radius, 6 + (radius - 6) * travel);
    c.globalAlpha = fade * 0.65;
    for (let i = 0; i < 8; i++) {
      const angle = (i * TAU) / 8 + 0.12;
      arc(c, x, y, inner, angle - 0.15, angle + 0.15, "#c5eee0");
      const start = Math.max(2, inner - 5);
      pixelLine(
        c,
        x + Math.cos(angle) * start,
        y + Math.sin(angle) * start,
        x + Math.cos(angle) * inner,
        y + Math.sin(angle) * inner,
        "#8be7ce",
      );
    }
  } else {
    // A quiet fixed weave with a single fade, preserving the action feedback.
    c.globalAlpha = fade * 0.5;
    const inner = radius * 0.62;
    for (let i = 0; i < 4; i++) {
      const angle = (i * TAU) / 4 + TAU / 8;
      arc(c, x, y, inner, angle - 0.25, angle + 0.25, "#8be7ce");
    }
  }
  c.globalAlpha = fade * 0.7;
  const knot = Math.round(settings.flashes ? 4 + travel * 3 : 5);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      pixelLine(
        c,
        Math.round(x) + sx * 2,
        Math.round(y),
        Math.round(x) + sx * knot,
        Math.round(y) + sy * knot,
        "#9ee7cb",
      );
  c.restore();
}

export function drawAbilityFeedback(c, game, settings) {
  for (const echo of game.echoes) drawEchoArrival(c, echo, settings);
  for (const hazard of game.hazards) drawReleasePulse(c, hazard, settings);
}
