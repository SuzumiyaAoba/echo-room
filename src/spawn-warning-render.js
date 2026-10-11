import { sprite } from "./art.js";
import { spawnWarnings } from "./spawn-warning.js";

const stamps = new Map();
function stamp(warning) {
  const key = `${warning.kind}:${warning.scale}`;
  if (stamps.has(key)) return stamps.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 72;
  const c = canvas.getContext("2d");
  c.imageSmoothingEnabled = false;
  sprite(c, warning.kind, 32, 56, { scale: warning.scale });
  c.globalCompositeOperation = "source-in";
  c.fillStyle = warning.color;
  c.fillRect(0, 0, canvas.width, canvas.height);
  stamps.set(key, canvas);
  return canvas;
}

export function drawSpawnWarnings(c, game, settings) {
  const warnings = spawnWarnings(game);
  if (!warnings.length) return;
  c.save();
  c.globalCompositeOperation = "source-over";
  c.imageSmoothingEnabled = false;
  for (const warning of warnings) {
    const { x, y, bounds, boss, elite, color } = warning,
      left = bounds.left + 2,
      right = bounds.right - 2,
      top = bounds.top + 2,
      bottom = y + 9,
      length = boss ? 7 : 5;
    c.globalAlpha = settings.flashes ? 0.34 + warning.progress * 0.2 : 0.5;
    c.drawImage(stamp(warning), x - 32, y - 56);
    c.globalAlpha = 1;
    for (const [paint, thickness] of [
      ["#08151b", 3],
      [elite ? "#e8c284" : color, 1],
    ]) {
      c.fillStyle = paint;
      for (const [px, py, sx, sy] of [
        [left, top, 1, 1],
        [right, top, -1, 1],
        [left, bottom, 1, -1],
        [right, bottom, -1, -1],
      ]) {
        c.fillRect(px - 1, py - 1, length * sx + 1, thickness);
        c.fillRect(px - 1, py - 1, thickness, length * sy + 1);
      }
    }
    c.fillStyle = "#08151b";
    c.fillRect(x - 9, y + 12, 18, 4);
    for (let tick = 0; tick < 4; tick++) {
      c.fillStyle = tick < warning.ticks ? color : "#405650";
      c.fillRect(x - 7 + tick * 4, y + 13, 3, 2);
    }
    if (elite || boss) {
      c.fillStyle = elite ? "#e8c284" : color;
      c.fillRect(x - 2, top - 1, 4, 2);
    }
  }
  c.restore();
}
