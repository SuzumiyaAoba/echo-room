import { memoryWardReadout } from "./memory-ward.js";

export function drawMemoryWard(c, enemy) {
  const state = memoryWardReadout(enemy);
  if (!state || !["open", "weaving"].includes(state.state)) return;
  const x = Math.round(enemy.x) - 15,
    y = Math.round(enemy.y + enemy.r + 7);
  c.fillStyle = "#142c37";
  c.fillRect(x, y, 30, 4);
  c.fillStyle = state.state === "open" ? "#f1d18e" : "#9fe2c8";
  c.fillRect(x + 1, y + 1, Math.round(28 * state.fraction), 2);
  if (state.state === "open") {
    c.fillRect(x - 3, y - 2, 2, 7);
    c.fillRect(x + 31, y - 2, 2, 7);
  }
}
