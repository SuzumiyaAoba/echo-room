import { pixelLine } from "./art.js";
import { NEEDLE_STITCH, needleMarks } from "./needle-stitch.js";

export function drawNeedleMarks(c, enemy, now) {
  const marks = needleMarks(enemy, now);
  const cue = enemy.needleCueUntil > now;
  if (!marks.length && !cue) return;
  const x = Math.round(enemy.x),
    y = Math.round(enemy.y - enemy.r - 10);
  c.save();
  for (let i = 0; i < marks.length; i++) {
    const left = x - 7 + i * 6;
    c.fillStyle = "#101c24";
    c.fillRect(left - 1, y - 1, 6, 5);
    c.fillStyle = "#f3d69a";
    c.fillRect(left, y, 4, 1);
    c.fillRect(left, y + 2, 4, 1);
    c.fillStyle = "#fff0cf";
    c.fillRect(
      left,
      y + 1,
      Math.ceil((4 * (marks[i].until - now)) / NEEDLE_STITCH.seconds),
      1,
    );
  }
  if (cue) {
    const top = y + 6;
    pixelLine(c, x - 3, top - 2, x + 3, top + 2, "#10272a", 3);
    pixelLine(c, x - 3, top + 2, x + 3, top - 2, "#10272a", 3);
    pixelLine(c, x - 3, top - 2, x + 3, top + 2, "#b9edd0");
    pixelLine(c, x - 3, top + 2, x + 3, top - 2, "#b9edd0");
  }
  c.restore();
}
