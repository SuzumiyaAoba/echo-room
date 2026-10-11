// Read collision geometry and choose ordinary movement; never change the game.
export function steerToExit(game, horizon = 0.125) {
  const p = game.player,
    goal = { x: 240, y: 43 };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const visible = (a, b) => {
    const steps = Math.ceil(distance(a, b) / 4);
    for (let i = 1; i <= steps; i++)
      if (
        game.solid(
          a.x + ((b.x - a.x) * i) / steps,
          a.y + ((b.y - a.y) * i) / steps,
          p.r,
        )
      )
        return false;
    return true;
  };
  if (distance(p, goal) < 27) return { mx: 0, my: 0 };
  let target = goal;
  if (!visible(p, goal)) {
    const nodes = new Map();
    for (let y = 40; y <= 264; y += 16)
      for (let x = 40; x <= 440; x += 16)
        if (!game.solid(x, y, p.r)) nodes.set(`${x},${y}`, { x, y });
    const free = [...nodes.values()];
    const start = free
      .sort((a, b) => distance(p, a) - distance(p, b))
      .find((node) => visible(p, node));
    const end = free.sort((a, b) => distance(goal, a) - distance(goal, b))[0];
    if (!start || !end) throw new Error("No free route to the exit");
    const key = (node) => `${node.x},${node.y}`;
    const queue = [start],
      parents = new Map([[key(start), null]]);
    for (let i = 0; i < queue.length && !parents.has(key(end)); i++) {
      const current = queue[i];
      for (const [dx, dy] of [
        [16, 0],
        [-16, 0],
        [0, 16],
        [0, -16],
      ]) {
        const next = nodes.get(`${current.x + dx},${current.y + dy}`);
        if (next && !parents.has(key(next))) {
          parents.set(key(next), current);
          queue.push(next);
        }
      }
    }
    if (!parents.has(key(end))) throw new Error("Disconnected exit route");
    const path = [];
    for (let node = end; node; node = parents.get(key(node))) path.push(node);
    target = path.reverse().find((node) => distance(p, node) > 12) || end;
  }
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const choices = directions
    .map(([mx, my]) => {
      const length = Math.hypot(mx, my),
        step = (game.stats.speed * horizon) / length;
      const next = { x: p.x + mx * step, y: p.y + my * step };
      return { mx, my, next, score: distance(next, target) };
    })
    .filter((choice) => visible(p, choice.next))
    .sort((a, b) => a.score - b.score);
  return choices[0] || { mx: 0, my: 0 };
}
