import { isBoss } from "./content.js";
import { pixelLine } from "./art.js";
import { TAU } from "./math.js";

export function drawArena(c, game, ring) {
  if (!isBoss(game.run.stage)) return;
  const kind = game.biome.boss,
    color = game.biome.color;
  c.globalAlpha = 0.17;
  if (kind === "ferryman") {
    // The quay's mooring ropes and two outlines of boats lost to the tide.
    for (const x of [72, 408]) {
      pixelLine(c, x, 64, x, 242, color, 2);
      for (let i = 0; i < 7; i++) {
        c.fillStyle = color;
        c.fillRect(x - 3, 73 + i * 25, 6, 3);
      }
      pixelLine(c, x - 17, 95, x, 78, color);
      pixelLine(c, x, 78, x + 17, 95, color);
      pixelLine(c, x - 17, 95, x - 17, 207, color);
      pixelLine(c, x + 17, 95, x + 17, 207, color);
      pixelLine(c, x - 17, 207, x, 225, color);
      pixelLine(c, x, 225, x + 17, 207, color);
    }
    for (let y = 104; y < 223; y += 40) {
      pixelLine(c, 104, y, 185, y, color);
      pixelLine(c, 295, y, 376, y, color);
    }
    ring(240, 156, 48, color);
    pixelLine(c, 225, 154, 255, 154, color, 2);
    pixelLine(c, 240, 131, 240, 182, color, 2);
    pixelLine(c, 224, 170, 240, 184, color, 2);
    pixelLine(c, 240, 184, 256, 170, color, 2);
  } else if (kind === "gardener") {
    // A glass rosette, cracked into petals. Marks stay below attack warnings.
    ring(240, 156, 78, color);
    ring(240, 156, 34, color);
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8,
        tip = { x: 240 + Math.cos(a) * 70, y: 156 + Math.sin(a) * 70 };
      for (const side of [-1, 1]) {
        const edge = {
          x: 240 + Math.cos(a + side * 0.35) * 40,
          y: 156 + Math.sin(a + side * 0.35) * 40,
        };
        pixelLine(c, 240, 156, edge.x, edge.y, color);
        pixelLine(c, edge.x, edge.y, tip.x, tip.y, color);
      }
    }
    for (const x of [65, 415])
      for (let y = 66; y < 250; y += 32) {
        pixelLine(c, x, y, x, y + 18, color, 2);
        pixelLine(c, x, y + 8, x - 6, y + 4, color, 2);
        pixelLine(c, x, y + 13, x + 7, y + 7, color, 2);
      }
  } else {
    // The loom's hour ring and twelve teeth. The hands have finally stopped.
    for (const r of [36, 66, 82]) ring(240, 156, r, color);
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12;
      pixelLine(
        c,
        240 + Math.cos(a) * 70,
        156 + Math.sin(a) * 70,
        240 + Math.cos(a) * 80,
        156 + Math.sin(a) * 80,
        color,
        3,
      );
    }
    pixelLine(c, 240, 156, 240, 105, color, 3);
    pixelLine(c, 240, 156, 280, 177, color, 3);
    for (const x of [70, 410]) {
      pixelLine(c, x, 68, x, 242, color, 3);
      for (let y = 78; y < 240; y += 18) {
        c.fillStyle = color;
        c.fillRect(x - 7, y, 14, 4);
      }
    }
  }
  c.globalAlpha = 1;
}
