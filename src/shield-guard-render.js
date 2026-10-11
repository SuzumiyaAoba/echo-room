import { shieldGuard } from "./shield-guard.js";

const shapes = new WeakMap();

function spans(pixels) {
  const rows = new Map();
  for (const key of pixels) {
    const [x, y] = key.split(",").map(Number);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  }
  const result = [];
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    let left = xs[0],
      right = left;
    for (const x of xs.slice(1)) {
      if (x === right + 1) right = x;
      else {
        result.push({ x: left, y, width: right - left + 1 });
        left = right = x;
      }
    }
    result.push({ x: left, y, width: right - left + 1 });
  }
  return result;
}

function guardShape(enemy, guard) {
  const key = `${guard.radius}|${guard.angle}`;
  const previous = shapes.get(enemy);
  if (previous?.key === key) return previous;
  const arc = new Set(),
    shadow = new Set(),
    caps = new Set();
  const steps = Math.ceil(guard.radius * guard.halfAngle * 4);
  for (let i = 0; i <= steps; i++) {
    const angle =
      guard.angle - guard.halfAngle + (i / steps) * guard.halfAngle * 2;
    arc.add(
      `${Math.round(Math.cos(angle) * guard.radius)},${Math.round(Math.sin(angle) * guard.radius)}`,
    );
  }
  for (const key of arc) {
    const [x, y] = key.split(",").map(Number);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) shadow.add(`${x + dx},${y + dy}`);
  }
  for (const side of [-1, 1]) {
    const angle = guard.angle + side * guard.halfAngle;
    for (
      let radius = guard.radius - 2;
      radius <= guard.radius + 2;
      radius += 0.5
    )
      caps.add(
        `${Math.round(Math.cos(angle) * radius)},${Math.round(Math.sin(angle) * radius)}`,
      );
  }
  const shape = {
    key,
    shadow: spans(shadow),
    arc: spans(arc),
    caps: spans(caps),
  };
  shapes.set(enemy, shape);
  return shape;
}

export function drawShieldGuard(c, enemy) {
  const guard = shieldGuard(enemy);
  if (!guard) return;
  const shape = guardShape(enemy, guard),
    x = Math.round(guard.x),
    y = Math.round(guard.y);
  c.save();
  c.globalAlpha = 1;
  for (const [color, rows] of [
    ["#173037", shape.shadow],
    ["#a2cfcc", shape.arc],
    ["#d7eee3", shape.caps],
  ]) {
    c.fillStyle = color;
    for (const row of rows) c.fillRect(x + row.x, y + row.y, row.width, 1);
  }
  c.restore();
}
