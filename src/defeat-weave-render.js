import { sprite, pixelLine } from "./art.js";
import { clamp } from "./math.js";

const layers = new Map();
const LAYER_LIMIT = 64;

function layerFor(cue) {
  const bob = Math.round(Math.sin(cue.walk) * 0.6);
  const wing = cue.kind === "moth" ? Math.floor(cue.walk * 2) % 2 : 0;
  const key = `${cue.kind}:${cue.scale}:${bob}:${wing}`;
  if (layers.has(key)) return layers.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d");
  c.imageSmoothingEnabled = false;
  sprite(c, cue.kind, 32, 50, { scale: cue.scale, walk: cue.walk });
  const pixels = c.getImageData(0, 0, 64, 64).data;
  let left = 64,
    top = 64,
    right = 0,
    bottom = 0;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      if (pixels[(y * 64 + x) * 4 + 3]) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
  const layer = { canvas, left, top, right, bottom };
  if (layers.size >= LAYER_LIMIT) layers.delete(layers.keys().next().value);
  layers.set(key, layer);
  return layer;
}

export function drawDefeats(c, game) {
  if (!game.defeats?.length) return;
  c.save();
  c.imageSmoothingEnabled = false;
  for (const cue of game.defeats) {
    const progress = clamp(cue.age / cue.duration, 0, 1);
    if (progress >= 1) continue;
    const layer = layerFor(cue);
    const spread = Math.round(
      Math.max(0, progress - 0.12) * (cue.boss ? 10 : 7),
    );
    const lift = Math.round(progress * (cue.boss ? 12 : 8));
    c.globalAlpha = 1 - progress;
    for (let y = layer.top, strip = 0; y < layer.bottom; y += 4, strip++) {
      const side = strip % 2 ? 1 : -1;
      const drift = Math.round(spread * (0.5 + (strip % 3) / 4));
      c.drawImage(
        layer.canvas,
        layer.left,
        y,
        layer.right - layer.left,
        Math.min(4, layer.bottom - y),
        Math.floor(cue.x) + layer.left - 32 + side * drift,
        Math.floor(cue.y) +
          y -
          50 -
          lift -
          (strip % 3) * Math.round(progress * 3),
        layer.right - layer.left,
        Math.min(4, layer.bottom - y),
      );
    }
    c.globalAlpha = (1 - progress) * 0.7;
    const width = cue.boss ? 15 : 8;
    for (let i = 0; i < (cue.boss ? 6 : 4); i++) {
      const side = i % 2 ? 1 : -1;
      const x = Math.floor(
        cue.x + side * (width + spread) * (0.5 + (i % 3) / 4),
      );
      const y = Math.floor(cue.y - 7 - lift - (i % 3) * 5);
      pixelLine(c, x, y, x + side, y - 2 - Math.round(progress * 3), cue.color);
    }
  }
  c.restore();
}
