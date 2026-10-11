import { pixelLine } from "./art.js";
import { TAU } from "./math.js";
import { bossTelegraph } from "./combat-feedback.js";
import { areaWarning, chargePath, shotWarning } from "./boss-warning.js";

const chargeCache = new WeakMap();

export function drawAreaWarning(c, hazard, ring) {
  const timing = areaWarning(hazard);
  if (!timing) return;
  const near = timing.progress >= 0.8,
    color = timing.active ? "#ffe0b0" : near ? "#f6c394" : "#eea18e";
  c.save();
  c.beginPath();
  c.rect(32, 32, 416, 240);
  c.clip();
  if (hazard.kind === "line") {
    const vertical = hazard.axis === "v",
      coordinate = Math.round(vertical ? hazard.x : hazard.y);
    c.fillStyle = color;
    c.globalAlpha = timing.active ? 0.5 * (1 - timing.afterimage) : 0.12;
    if (vertical) c.fillRect(coordinate - hazard.r, 32, hazard.r * 2, 240);
    else c.fillRect(32, coordinate - hazard.r, 416, hazard.r * 2);
    c.globalAlpha = timing.active ? 1 - timing.afterimage : 0.6;
    for (const offset of [-hazard.r, hazard.r]) {
      if (vertical)
        pixelLine(c, coordinate + offset, 32, coordinate + offset, 272, color);
      else
        pixelLine(c, 32, coordinate + offset, 448, coordinate + offset, color);
    }
    if (!timing.active) {
      const half = vertical ? 120 : 208,
        start = 32,
        end = vertical ? 272 : 448;
      c.globalAlpha = 0.9;
      for (const position of [
        start + half * timing.progress,
        end - half * timing.progress,
      ]) {
        if (vertical)
          c.fillRect(
            coordinate - hazard.r,
            Math.round(position) - 1,
            hazard.r * 2,
            2,
          );
        else
          c.fillRect(
            Math.round(position) - 1,
            coordinate - hazard.r,
            2,
            hazard.r * 2,
          );
      }
    }
  } else {
    c.globalAlpha = timing.active ? 1 - timing.afterimage : 0.75;
    ring(hazard.x, hazard.y, hazard.r, color);
    if (timing.active) {
      c.globalAlpha = 0.35 * (1 - timing.afterimage);
      ring(hazard.x, hazard.y, hazard.r * (1 - timing.afterimage), color);
    } else {
      c.globalAlpha = 0.35 + timing.progress * 0.45;
      ring(hazard.x, hazard.y, Math.floor(hazard.r * timing.progress), color);
      c.globalAlpha = 0.9;
      for (let i = 0; i < 12; i++) {
        const angle = -Math.PI / 2 + (i * TAU) / 12,
          radius = hazard.r + 3;
        c.fillStyle =
          i < Math.floor(timing.progress * 12) ? "#ffe0b0" : "#7d5555";
        c.fillRect(
          Math.round(hazard.x + Math.cos(angle) * radius) - 1,
          Math.round(hazard.y + Math.sin(angle) * radius) - 1,
          2,
          2,
        );
      }
      if (hazard.weavable) {
        c.fillStyle = "#dfc2ed";
        c.fillRect(Math.round(hazard.x) - 2, Math.round(hazard.y) - 3, 4, 6);
        if (timing.weaveProgress > 0) {
          c.fillStyle = "#13262a";
          c.fillRect(
            Math.round(hazard.x) - 10,
            Math.round(hazard.y) + hazard.r + 5,
            20,
            4,
          );
          c.fillStyle = "#b6eac4";
          c.fillRect(
            Math.round(hazard.x) - 9,
            Math.round(hazard.y) + hazard.r + 6,
            Math.round(timing.weaveProgress * 18),
            2,
          );
        }
      }
    }
  }
  c.restore();
}

function chargeRows(game, boss) {
  const key = [boss.x, boss.y, boss.r, boss.angle, game.tiles.toString()].join(
    "|",
  );
  let cached = chargeCache.get(boss);
  if (cached?.key === key) return cached;
  const path = chargePath(game, boss);
  if (!path) return null;
  const rows = new Map();
  for (const point of path)
    for (
      let y = Math.ceil(point.y - boss.r);
      y <= Math.floor(point.y + boss.r);
      y++
    ) {
      const span = Math.sqrt(Math.max(0, boss.r ** 2 - (y - point.y) ** 2)),
        left = Math.ceil(point.x - span),
        right = Math.floor(point.x + span),
        row = rows.get(y);
      if (left > right) continue;
      if (row) {
        row.left = Math.min(row.left, left);
        row.right = Math.max(row.right, right);
      } else rows.set(y, { y, left, right });
    }
  const outline = [];
  for (const row of rows.values()) {
    const spans = [
      [row.left, row.left],
      [row.right, row.right],
    ];
    for (const neighbor of [rows.get(row.y - 1), rows.get(row.y + 1)]) {
      if (!neighbor) spans.push([row.left, row.right]);
      else {
        if (row.left < neighbor.left)
          spans.push([row.left, Math.min(row.right, neighbor.left - 1)]);
        if (row.right > neighbor.right)
          spans.push([Math.max(row.left, neighbor.right + 1), row.right]);
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const span of spans) {
      const previous = merged.at(-1);
      if (previous && span[0] <= previous[1] + 1)
        previous[1] = Math.max(previous[1], span[1]);
      else merged.push([...span]);
    }
    for (const [left, right] of merged) outline.push({ y: row.y, left, right });
  }
  cached = { key, path, rows: [...rows.values()], outline };
  chargeCache.set(boss, cached);
  return cached;
}

export function drawBossWarning(c, game, ring) {
  const boss = game.boss,
    timing = bossTelegraph(boss);
  if (!timing) return;
  c.save();
  c.beginPath();
  c.rect(32, 32, 416, 240);
  c.clip();
  if (boss.plan.kind === "charge") {
    const lane = chargeRows(game, boss);
    if (lane) {
      c.fillStyle = "#efa58b";
      c.globalAlpha = 0.12;
      for (const row of lane.rows)
        c.fillRect(row.left, row.y, row.right - row.left + 1, 1);
      c.globalAlpha = 0.45 + timing.progress * 0.4;
      for (const row of lane.outline)
        c.fillRect(row.left, row.y, row.right - row.left + 1, 1);
      c.globalAlpha = 0.8;
      for (let i = 0; i + 1 < lane.path.length; i += 5) {
        const point = lane.path[i];
        c.fillRect(Math.round(point.x) - 1, Math.round(point.y) - 1, 2, 2);
      }
      const point =
        lane.path[Math.round(timing.progress * (lane.path.length - 1))];
      c.globalAlpha = 1;
      ring(point.x, point.y, 3, "#ffe0b0");
    }
  } else {
    const shot = shotWarning(boss);
    for (const angle of shot.angles) {
      if (!Number.isFinite(angle)) continue;
      const start = boss.r + 4,
        length = 65,
        x = boss.x + Math.cos(angle) * length,
        y = boss.y + Math.sin(angle) * length;
      c.globalAlpha = 0.4 + shot.progress * 0.4;
      pixelLine(
        c,
        boss.x + Math.cos(angle) * start,
        boss.y + Math.sin(angle) * start,
        x,
        y,
        "#f2b493",
      );
      c.globalAlpha = 0.9;
      for (const side of [-1, 1])
        pixelLine(
          c,
          x,
          y,
          x + Math.cos(angle + side * 2.5) * 4,
          y + Math.sin(angle + side * 2.5) * 4,
          "#ffd6a0",
        );
      const distance = start + (length - start) * shot.progress;
      c.fillStyle = "#ffe0b0";
      c.fillRect(
        Math.round(boss.x + Math.cos(angle) * distance) - 1,
        Math.round(boss.y + Math.sin(angle) * distance) - 1,
        2,
        2,
      );
    }
  }
  c.restore();
}
