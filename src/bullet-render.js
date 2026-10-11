import { pixelLine } from "./art.js";

const WIDTH = 480,
  HEIGHT = 300;
const glyphs = new Map(),
  layers = new WeakMap();
function glyph(color) {
  let pixels = glyphs.get(color);
  if (pixels) return pixels;
  // Only opaque RGB colors reach this cache. Keep native RGBA byte order.
  const rgb = parseInt(color.slice(1), 16);
  const inner = [rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255];
  const bytes = new Uint8ClampedArray(6 * 6 * 4);
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++) {
      const rgba =
        x >= 2 && x < 4 && y >= 2 && y < 4
          ? [255, 228, 189, 255]
          : x >= 1 && x < 5 && y >= 1 && y < 5
            ? inner
            : [85, 51, 52, 255];
      bytes.set(rgba, (y * 6 + x) * 4);
    }
  pixels = new Uint32Array(bytes.buffer);
  if (glyphs.size >= 64) glyphs.delete(glyphs.keys().next().value);
  glyphs.set(color, pixels);
  return pixels;
}
function layer(c) {
  let value = layers.get(c);
  if (value) return value;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  // WebKit needs a CPU layer for repeated putImageData/drawImage updates
  // within one frame; the GPU layer can lose an earlier projectile group.
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const data = g.createImageData(WIDTH, HEIGHT);
  value = { canvas, g, data, pixels: new Uint32Array(data.data.buffer) };
  layers.set(c, value);
  return value;
}
function individual(c, bullet) {
  const x = Math.round(bullet.x),
    y = Math.round(bullet.y);
  c.fillStyle = "#553334";
  c.fillRect(x - 3, y - 3, 6, 6);
  c.fillStyle = bullet.color;
  c.fillRect(x - 2, y - 2, 4, 4);
  c.fillStyle = "#ffe4bd";
  c.fillRect(x - 1, y - 1, 2, 2);
}
function group(c, bullets, start, end, tx, ty) {
  const output = layer(c);
  let left = WIDTH,
    top = HEIGHT,
    right = 0,
    bottom = 0;
  output.pixels.fill(0);
  for (let i = start; i < end; i++) {
    const b = bullets[i];
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    // Clip after the room's integer shake so edge projectiles stay visible.
    const x = Math.round(b.x) + tx - 3,
      y = Math.round(b.y) + ty - 3,
      source = glyph(b.color);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + 6);
    bottom = Math.max(bottom, y + 6);
    for (let row = 0; row < 6; row++) {
      const yy = y + row;
      if (yy < 0 || yy >= HEIGHT) continue;
      for (let col = 0; col < 6; col++) {
        const xx = x + col;
        if (xx >= 0 && xx < WIDTH)
          output.pixels[yy * WIDTH + xx] = source[row * 6 + col];
      }
    }
  }
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(WIDTH, right);
  bottom = Math.min(HEIGHT, bottom);
  const width = right - left,
    height = bottom - top;
  if (width > 0 && height > 0) {
    output.g.putImageData(output.data, 0, 0, left, top, width, height);
    c.drawImage(
      output.canvas,
      left,
      top,
      width,
      height,
      left - tx,
      top - ty,
      width,
      height,
    );
  }
  c.fillStyle = "#ffe4bd";
}

export function drawBullets(c, bullets) {
  for (let i = 0; i < bullets.length; ) {
    const b = bullets[i];
    if (b.friendly) {
      if (b.shortRange) c.globalAlpha = Math.min(1, b.life / 0.15);
      pixelLine(
        c,
        b.x,
        b.y,
        b.x - b.vx * b.trail,
        b.y - b.vy * b.trail,
        b.color,
        1,
      );
      c.fillStyle = "#f3f5d5";
      c.fillRect(b.x - 1, b.y - 1, 2, 2);
      c.globalAlpha = 1;
      i++;
    } else {
      let end = i + 1;
      while (end < bullets.length && !bullets[end].friendly) end++;
      // Small runs keep individual rectangles: a full layer costs more there.
      let opaque =
        end - i >= 128 &&
        c.globalAlpha === 1 &&
        c.globalCompositeOperation === "source-over";
      if (opaque)
        for (let n = i; n < end; n++)
          if (!/^#[0-9a-f]{6}$/i.test(bullets[n].color)) {
            opaque = false;
            break;
          }
      const t = opaque ? c.getTransform() : null;
      if (
        t &&
        t.a === 1 &&
        t.d === 1 &&
        t.b === 0 &&
        t.c === 0 &&
        Number.isInteger(t.e) &&
        Number.isInteger(t.f)
      )
        group(c, bullets, i, end, t.e, t.f);
      else for (let n = i; n < end; n++) individual(c, bullets[n]);
      i = end;
    }
  }
}
