import { pixelLine } from "./art.js";
import { distance } from "./math.js";

export function drawStolenEcho(ctx, h, ring) {
  if (h.owner.hp <= 0) return;
  const active = h.age >= h.warning;
  let last = null;
  for (let i = 0; i < h.frames.length; i += 6) {
    const f = h.frames[i];
    if (last && distance(last, f) < 5) continue;
    ctx.globalAlpha = active && i < h.index ? 0.1 : 0.38;
    ctx.fillStyle = "#eb99a0";
    ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 4, 2, 2);
    if (i % 36 === 0 && h.frames[i + 6]) {
      const next = h.frames[i + 6];
      const angle = Math.atan2(next.y - f.y, next.x - f.x);
      for (const side of [-0.7, 0.7])
        pixelLine(
          ctx,
          f.x,
          f.y - 3,
          f.x - Math.cos(angle + side) * 4,
          f.y - 3 - Math.sin(angle + side) * 4,
          "#eb99a0",
        );
    }
    last = f;
  }
  ctx.globalAlpha = 1;
  const progress = Math.min(1, h.age / h.warning);
  ring(
    h.x,
    h.y - 3,
    active ? h.r + 3 : h.r + 3 + (1 - progress) * 10,
    "#ec9a9d",
  );
  if (!active) {
    ring(h.owner.x, h.owner.y - 4, h.owner.r + 4, "#dc8b99");
    ctx.fillStyle = "#f2b6b0";
    ctx.font = "7px monospace";
    ctx.textAlign = "center";
    ctx.fillText("盗まれた昨日", h.x, Math.max(40, h.y - 24));
  }
}
