import { angleTo, distance } from "./math.js";
import { ROOM_LAYOUT_VERSION } from "./room-layouts.js";

const rooms = new WeakMap();

function clear(game, a, b, radius) {
  const steps = Math.ceil(distance(a, b) / 8);
  for (let i = 1; i <= steps; i++)
    if (
      game.solid(
        a.x + ((b.x - a.x) * i) / steps,
        a.y + ((b.y - a.y) * i) / steps,
        radius,
      )
    )
      return false;
  return true;
}

function gridFor(game, radius) {
  let cache = rooms.get(game);
  if (!cache || cache.tiles !== game.tiles) {
    cache = { tiles: game.tiles, grids: new Map() };
    rooms.set(game, cache);
  }
  if (cache.grids.has(radius)) return cache.grids.get(radius);
  const nodes = [];
  const byCell = new Map();
  for (let y = 40; y <= 264; y += 16)
    for (let x = 40; x <= 440; x += 16)
      if (!game.solid(x, y, radius)) {
        const node = { x, y, index: nodes.length, neighbors: [] };
        nodes.push(node);
        byCell.set(`${x},${y}`, node);
      }
  for (const node of nodes)
    for (const [dx, dy] of [
      [16, 0],
      [-16, 0],
      [0, 16],
      [0, -16],
    ]) {
      const other = byCell.get(`${node.x + dx},${node.y + dy}`);
      if (other && clear(game, node, other, radius))
        node.neighbors.push(other.index);
    }
  const grid = { nodes, fields: new Map() };
  cache.grids.set(radius, grid);
  return grid;
}

function nearest(game, grid, point, radius, visible) {
  let best = null,
    bestDistance = Infinity;
  for (const node of grid.nodes) {
    const d = (node.x - point.x) ** 2 + (node.y - point.y) ** 2;
    if (d < bestDistance && (!visible || clear(game, point, node, radius))) {
      best = node;
      bestDistance = d;
    }
  }
  return best;
}

function fieldFor(grid, goal) {
  if (grid.fields.has(goal.index)) return grid.fields.get(goal.index);
  const field = new Int16Array(grid.nodes.length).fill(-1);
  field[goal.index] = 0;
  const queue = [goal.index];
  for (let i = 0; i < queue.length; i++)
    for (const index of grid.nodes[queue[i]].neighbors)
      if (field[index] < 0) {
        field[index] = field[queue[i]] + 1;
        queue.push(index);
      }
  // Bound moving-target fields and let each room die with its Game object.
  if (grid.fields.size >= 16)
    grid.fields.delete(grid.fields.keys().next().value);
  grid.fields.set(goal.index, field);
  return field;
}

export function enemyWaypoint(game, enemy, target) {
  if (
    game.run.layoutVersion !== ROOM_LAYOUT_VERSION ||
    clear(game, enemy, target, enemy.r)
  )
    return target;
  const grid = gridFor(game, enemy.r);
  const start = nearest(game, grid, enemy, enemy.r, true);
  const goal = nearest(game, grid, target, enemy.r, false);
  if (!start || !goal) return target;
  const field = fieldFor(grid, goal);
  if (field[start.index] < 0) return target;
  // A player can stand closer to a wall than this body's radius permits.
  // Once the final grid cell is reached, let ordinary collision movement
  // approach the actual target instead of stopping a whole cell away.
  if (field[start.index] === 0) return target;
  let node = start,
    waypoint = start;
  for (let i = 0; i < 32; i++) {
    if (clear(game, enemy, node, enemy.r)) waypoint = node;
    else break;
    if (field[node.index] === 0) break;
    const next = node.neighbors
      .map((index) => grid.nodes[index])
      .filter((n) => field[n.index] === field[node.index] - 1)
      .sort((a, b) => distance(a, target) - distance(b, target))[0];
    if (!next) break;
    node = next;
  }
  return waypoint;
}

export function approachEnemy(game, enemy, target, speed, dt, turn = 0) {
  if (game.run.layoutVersion !== ROOM_LAYOUT_VERSION) {
    const angle = angleTo(enemy, target) + turn;
    // Retain the old multiplication order as well as its movement rules.
    game.move(
      enemy,
      Math.cos(angle) * speed * dt,
      Math.sin(angle) * speed * dt,
    );
    return;
  }
  const waypoint = enemyWaypoint(game, enemy, target);
  const indirect = waypoint !== target;
  const step = indirect
    ? Math.min(speed * dt, distance(enemy, waypoint))
    : speed * dt;
  const angle = angleTo(enemy, waypoint) + (indirect ? 0 : turn);
  game.move(enemy, Math.cos(angle) * step, Math.sin(angle) * step);
}
