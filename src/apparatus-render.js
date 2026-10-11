import { pixelLine } from "./art.js";

export function drawApparatus(c, game, ring) {
  const machine = game.apparatus;
  if (!machine) return;
  if (machine.kind === "tide") {
    for (const node of machine.objects) {
      if (!node.lit) continue;
      c.globalAlpha = 0.09;
      c.fillStyle = "#b1edd9";
      c.fillRect(node.x - 32, 40, 64, 224);
      c.globalAlpha = 0.5;
      for (let y = 42; y < 264; y += 12) {
        c.fillRect(node.x - 32, y, 1, 6);
        c.fillRect(node.x + 31, y, 1, 6);
      }
    }
    if (machine.wave || machine.warning > 0) {
      const y = Math.round(machine.wave?.y || 42);
      c.globalAlpha = machine.wave ? 0.65 : 0.25 + Math.sin(game.t * 16) * 0.15;
      for (let x = 34; x < 446; x += 4) {
        if (
          machine.objects.some((node) => node.lit && Math.abs(x - node.x) < 32)
        )
          continue;
        c.fillStyle = "#68b4c6";
        c.fillRect(x, y - 6, 4, 12);
        c.fillStyle = "#c3e5db";
        c.fillRect(x, y - 3 + ((x / 4) % 3), 4, 2);
      }
    }
    c.globalAlpha = 1;
  }
  for (const node of machine.objects) {
    const { x, y } = node;
    const color = node.lit ? "#b6eac4" : machine.color;
    c.globalAlpha = node.woven ? 0.8 : 0.3;
    ring(x, y, 16, color);
    c.globalAlpha = 1;
    c.fillStyle = "#0b1d25";
    c.fillRect(x - 9, y - 8, 18, 17);
    if (machine.kind === "garden") {
      pixelLine(c, x, y + 7, x, y - 6, "#71997b", 2);
      pixelLine(c, x - 6, y + 2, x, y + 5, "#71997b", 2);
      pixelLine(c, x + 6, y, x, y + 4, "#71997b", 2);
      c.fillStyle = color;
      const spread = node.lit ? 6 : 3;
      c.fillRect(x - spread, y - 12, spread * 2, 4);
      c.fillRect(x - 3, y - 16, 6, 12);
      c.fillStyle = node.lit ? "#ebefd0" : "#9a719f";
      c.fillRect(x - 2, y - 11, 4, 3);
      if (!node.lit && node.timer < 0.85) {
        c.globalAlpha = 0.4 + Math.sin(game.t * 18) * 0.2;
        ring(x, y - 9, 9, "#ef9ca7");
        c.globalAlpha = 1;
      }
    } else if (machine.kind === "furnace") {
      if (machine.warning > 0) {
        c.globalAlpha = 0.3 + Math.sin(game.t * 16) * 0.15;
        ring(x, y, 24, "#f4b07d");
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4 + 0.2;
          pixelLine(
            c,
            x + Math.cos(angle) * 14,
            y + Math.sin(angle) * 14,
            x + Math.cos(angle) * 40,
            y + Math.sin(angle) * 40,
            "#f4b07d",
          );
        }
        c.globalAlpha = 1;
      }
      c.fillStyle = "#735344";
      c.fillRect(x - 7, y - 5, 14, 12);
      c.fillStyle = color;
      c.fillRect(x - 8, y - 6, 16, 2);
      c.fillRect(x - 8, y + 6, 16, 2);
      ring(x, y, 4, color);
      pixelLine(c, x - 5, y, x + 5, y, color);
      pixelLine(c, x, y - 5, x, y + 5, color);
      if (node.woven || node.lit) {
        c.globalAlpha = 0.5;
        c.fillStyle = "#bde7d7";
        for (let i = 0; i < 3; i++)
          c.fillRect(
            x - 5 + i * 5,
            y - 14 - Math.floor((game.t * 10 + i * 3) % 7),
            2,
            4,
          );
        c.globalAlpha = 1;
      }
    } else {
      c.fillStyle = "#658686";
      c.fillRect(x - 3, y - 12, 6, 19);
      c.fillRect(x - 9, y + 4, 18, 3);
      c.fillStyle = color;
      c.fillRect(x - 6, y - 14, 12, 8);
      c.fillStyle = node.lit ? "#edffe1" : "#354d5c";
      c.fillRect(x - 3, y - 12, 6, 4);
    }
    c.fillStyle = "#142b32";
    c.fillRect(x - 14, y + 11, 28, 4);
    c.fillStyle = node.lit ? "#b6eac4" : machine.color;
    c.fillRect(
      x - 13,
      y + 12,
      Math.round((26 * node.charge) / machine.charge),
      2,
    );
  }
}
