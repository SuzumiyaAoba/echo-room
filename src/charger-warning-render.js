import { chargerWarning } from "./charger-warning.js";

const lanes = new WeakMap();

function lanePixels(game, enemy, warning) {
  const key = [
    enemy.x,
    enemy.y,
    enemy.r,
    enemy.angle,
    game.player.r,
    game.tiles.toString(),
  ].join("|");
  const old = lanes.get(enemy);
  if (old?.key === key) return old;
  const rows = new Map();
  for (const point of warning.path)
    for (
      let y = Math.ceil(point.y - warning.radius);
      y <= Math.floor(point.y + warning.radius);
      y++
    ) {
      const span = Math.sqrt(
          Math.max(0, warning.radius ** 2 - (y - point.y) ** 2),
        ),
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
    for (const next of [rows.get(row.y - 1), rows.get(row.y + 1)]) {
      if (!next) spans.push([row.left, row.right]);
      else {
        if (row.left < next.left)
          spans.push([row.left, Math.min(row.right, next.left - 1)]);
        if (row.right > next.right)
          spans.push([Math.max(row.left, next.right + 1), row.right]);
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
  const lane = { key, rows: [...rows.values()], outline };
  lanes.set(enemy, lane);
  return lane;
}

export function drawChargerWarnings(c, game) {
  c.save();
  c.beginPath();
  c.rect(32, 32, 416, 240);
  c.clip();
  for (const enemy of game.enemies) {
    const warning = chargerWarning(game, enemy);
    if (!warning) continue;
    const lane = lanePixels(game, enemy, warning),
      near = warning.progress >= 0.75;
    c.fillStyle = near ? "#f3bd8e" : "#ed987e";
    c.globalAlpha = 0.09;
    for (const row of lane.rows)
      c.fillRect(row.left, row.y, row.right - row.left + 1, 1);
    c.globalAlpha = 0.65;
    for (const row of lane.outline)
      c.fillRect(row.left, row.y, row.right - row.left + 1, 1);
    c.globalAlpha = 0.8;
    for (let i = 0; i < warning.path.length; i += 5) {
      const p = warning.path[i];
      c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    const end = warning.path.at(-1),
      x = Math.round(end.x),
      y = Math.round(end.y);
    c.globalAlpha = 1;
    c.fillStyle = "#ffe0b0";
    for (const [dx, dy] of [
      [-3, 0],
      [3, 0],
      [0, -3],
      [0, 3],
    ])
      c.fillRect(x + dx, y + dy, 1, 1);
    const left = Math.round(enemy.x) - 8,
      top = Math.min(268, Math.round(enemy.y + enemy.r) + 7);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = "#152027";
      c.fillRect(left + i * 4 - 1, top - 1, 5, 4);
      c.fillStyle =
        i < Math.floor(warning.progress * 4) ? "#ffe0b0" : "#80574d";
      c.fillRect(left + i * 4, top, 3, 2);
    }
  }
  c.restore();
}
