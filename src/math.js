export const TAU = Math.PI * 2;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export function pointInTriangle(point, a, b, c) {
  const cross = (u, v, p) =>
    (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x);
  if (Math.abs(cross(a, b, c)) < 1e-8) return false;
  const signs = [cross(a, b, point), cross(b, c, point), cross(c, a, point)];
  return signs.every((n) => n >= 0) || signs.every((n) => n <= 0);
}
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = clamp(
    ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
export function segmentPairDistance(a, b, c, d) {
  const cross = (p, q, r) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const overlaps =
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + 1e-8 &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
      Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + 1e-8;
  if (
    overlaps &&
    cross(a, b, c) * cross(a, b, d) <= 1e-8 &&
    cross(c, d, a) * cross(c, d, b) <= 1e-8
  )
    return 0;
  return Math.min(
    segmentDistance(a, c, d),
    segmentDistance(b, c, d),
    segmentDistance(c, a, b),
    segmentDistance(d, a, b),
  );
}
export function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export class Random {
  constructor(seed) {
    this.state = typeof seed === "number" ? seed >>> 0 : hash(seed);
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state >>>= 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick(items) {
    return items[this.int(0, items.length - 1)];
  }
  shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
