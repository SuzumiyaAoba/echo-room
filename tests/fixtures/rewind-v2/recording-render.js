import { echoRecording } from "./recording-preview.js";
import { pixelLine } from "../../../src/art.js";

// Integer rasterization retains every recorded turn. Shared pixels are drawn
// once, so standing still, firing repeatedly and crossing a path do not make
// the preview opaque. Dashes are anchored to the floor, not an animation clock.
function addLine(pixels, x0, y0, x1, y1, dashed = false) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    if (!dashed || (((x0 + y0 * 2) % 8) + 8) % 8 < 3)
      pixels.set(`${x0},${y0}`, [x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

export function drawRecordingPreview(c, game) {
  const recording = echoRecording(game);
  if (!recording?.available) return;
  const path = new Map(),
    shots = new Map();
  for (let i = 1; i < recording.points.length; i++) {
    const a = recording.points[i - 1],
      b = recording.points[i];
    addLine(path, a.x, a.y + 4, b.x, b.y + 4, true);
  }
  for (const s of recording.shots) {
    const dx = Math.cos(s.angle),
      dy = Math.sin(s.angle);
    addLine(
      shots,
      s.x + dx * 3,
      s.y - 3 + dy * 3,
      s.x + dx * 8,
      s.y - 3 + dy * 8,
    );
  }
  c.save();
  c.globalAlpha = 0.38;
  c.fillStyle = "#739198";
  for (const [x, y] of path.values()) c.fillRect(x, y, 1, 1);
  c.globalAlpha = 0.48;
  c.fillStyle = "#d0b380";
  for (const [x, y] of shots.values()) c.fillRect(x, y, 1, 1);
  const x = Math.round(recording.origin.x),
    y = Math.round(recording.origin.y) + 4;
  c.globalAlpha = 0.7;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      pixelLine(c, x + sx * 4, y + sy * 5, x + sx * 7, y + sy * 5, "#91afad");
      pixelLine(c, x + sx * 7, y + sy * 5, x + sx * 7, y + sy * 3, "#91afad");
    }
  c.restore();
}
