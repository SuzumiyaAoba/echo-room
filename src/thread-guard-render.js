import { pixelLine } from "./art.js";
import { STORED_LIGHT_LIMIT } from "./counter-thread.js";

export function drawStoredLights(c, echo) {
  for (let i = 0; i < STORED_LIGHT_LIMIT; i++) {
    const x = Math.round(echo.x) - 5 + i * 4,
      y = Math.round(echo.y) - 21;
    c.fillStyle = "#132c31";
    c.fillRect(x - 1, y - 1, 5, 5);
    c.fillStyle = i < (echo.returnStock || 0) ? "#f3d69a" : "#49665b";
    c.fillRect(x, y, 3, 3);
    if (i < (echo.returnStock || 0)) {
      c.fillStyle = "#fff1b9";
      c.fillRect(x + 1, y + 1, 1, 1);
    }
  }
}

export function drawThreadGuards(c, game) {
  const width = game.stats.threadWidth;
  for (const { a, b } of game.threadGuards()) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / length,
      ny = (b.x - a.x) / length;
    c.globalAlpha = 0.18;
    for (const side of [-1, 1])
      pixelLine(
        c,
        a.x + nx * width * side,
        a.y - 3 + ny * width * side,
        b.x + nx * width * side,
        b.y - 3 + ny * width * side,
        "#a3e7cd",
        1,
      );
    c.globalAlpha = 0.65;
    for (const p of [a, b]) {
      c.fillStyle = "#b6f4dc";
      c.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 4, 5, 1);
      c.fillRect(Math.round(p.x), Math.round(p.y) - 6, 1, 5);
    }
  }
  c.globalAlpha = 1;
}

export function drawThreadCut(c, h, settings) {
  const radius = settings.flashes > 0 ? 3 + (h.age / h.duration) * 7 : 6;
  c.globalAlpha = Math.max(0, 1 - h.age / h.duration);
  const x = Math.round(h.x),
    y = Math.round(h.y) - 3,
    r = Math.round(radius);
  for (const [dx, dy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ])
    pixelLine(c, x + dx * 2, y, x + dx * r, y + dy * r, "#b6f4dc", 1);
  c.fillStyle = "#e3fff0";
  c.fillRect(x - 1, y - 1, 3, 3);
  c.globalAlpha = 1;
}
