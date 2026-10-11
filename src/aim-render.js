import { pixelLine } from "./art.js";

export function drawAim(c, cue) {
  if (!cue) return;
  const color = cue.source === "assist" ? "#8be7ce" : "#fff0cf";
  const ux = Math.cos(cue.angle),
    uy = Math.sin(cue.angle);
  const point = (along, across = 0) => [
    Math.round(cue.x + ux * along - uy * across),
    Math.round(cue.y + uy * along + ux * across),
  ];
  const lines = [
    [point(18, -2), point(21)],
    [point(21), point(18, 2)],
  ];
  if (cue.point) {
    const x = Math.round(cue.point.x),
      y = Math.round(cue.point.y);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      lines.push([
        [x + dx * 4, y + dy * 4],
        [x + dx * 6, y + dy * 6],
      ]);
  }
  c.save();
  c.globalAlpha = 1;
  for (const width of [3, 1])
    for (const [from, to] of lines)
      pixelLine(c, ...from, ...to, width === 3 ? "#08171b" : color, width);
  c.restore();
}
