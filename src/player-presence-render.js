import { pixelLine } from "./art.js";

// The controlled Mina keeps a quiet foot marker when echoes share her position.
// Anchor to the actual feet, independently of weapon recoil or invulnerability.
export function drawPlayerPresence(c, player) {
  const x = Math.round(player.x),
    y = Math.round(player.y);
  c.save();
  c.globalAlpha = 1;
  for (const [color, width] of [
    ["#08171b", 3],
    ["#f1d0a1", 1],
  ]) {
    pixelLine(c, x - 4, y + 9, x, y + 6, color, width);
    pixelLine(c, x, y + 6, x + 4, y + 9, color, width);
  }
  c.restore();
}
