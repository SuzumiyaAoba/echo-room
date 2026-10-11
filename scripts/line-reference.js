// Frozen pre-batching implementation for browser pixel and timing comparisons.
// This module is diagnostic only and is not imported by the production game.
export function legacyPixelLine(ctx, x0, y0, x1, y1, color, width = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1,
    dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (let i = 0; i < 1200; i++) {
    ctx.fillRect(
      x0 - Math.floor(width / 2),
      y0 - Math.floor(width / 2),
      width,
      width,
    );
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export function withLegacyPixelLine(source) {
  const start = source.indexOf("export function pixelLine(");
  const end = source.indexOf("export const ICONS", start);
  if (start < 0 || end <= start)
    throw new Error("Cannot locate pixelLine for comparison");
  return (
    source.slice(0, start) +
    "export " +
    legacyPixelLine.toString().replace("legacyPixelLine", "pixelLine") +
    "\n" +
    source.slice(end)
  );
}
