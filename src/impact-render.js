import { pixelLine } from "./art.js";

export function drawImpactCue(c, game, settings) {
  const cue = game.hitCue;
  if (!cue) return;
  c.save();
  // Information remains readable with flashes disabled. Only a quiet fade,
  // driven by the paused room clock, accompanies the normal visual setting.
  c.globalAlpha = settings.flashes
    ? Math.min(1, (cue.duration - cue.age) / 0.25)
    : 1;
  const color = cue.kind === "shield" ? "#b8d8e3" : "#f0a18a";
  const x = game.player.x,
    y = game.player.y - 6;
  if (cue.angle === null) {
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const cx = x + sx * 15,
          cy = y + sy * 13;
        pixelLine(c, cx - sx * 4, cy, cx, cy, color);
        pixelLine(c, cx, cy, cx, cy - sy * 4, color);
      }
  } else {
    const ux = Math.cos(cue.angle),
      uy = Math.sin(cue.angle);
    const tip = { x: x + ux * 16, y: y + uy * 16 };
    if (cue.kind === "shield") {
      // A crossbar means the blow stopped; damage uses an inward chevron.
      for (const [color, width] of [
        ["#13252f", 3],
        ["#b8d8e3", 1],
      ])
        pixelLine(
          c,
          x + ux * 19 - uy * 6,
          y + uy * 19 + ux * 6,
          x + ux * 19 + uy * 6,
          y + uy * 19 - ux * 6,
          color,
          width,
        );
    } else
      for (const side of [-1, 1]) {
        const ex = x + ux * 22 - uy * side * 4;
        const ey = y + uy * 22 + ux * side * 4;
        pixelLine(c, tip.x, tip.y, ex, ey, "#13252f", 3);
        pixelLine(c, tip.x, tip.y, ex, ey, color);
      }
  }
  c.restore();
}
