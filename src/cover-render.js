import { pixelLine } from "./art.js";

// Continuous props follow every actual solid cell, including odd widths and
// the patches removed for repairable devices. Edge caps project above the
// walking plane; their small contact shadows stay outside collision geometry.
export function drawRegionalCover(c, game, act) {
  const tile = (x, y) => game.tiles[y]?.[x] === 2;
  for (let row = 1; row < game.tiles.length - 1; row++)
    for (let col = 1; col < game.tiles[row].length - 1; col++) {
      if (!tile(col, row)) continue;
      const x = 16 + col * 16,
        y = 16 + row * 16,
        top = !tile(col, row - 1),
        bottom = !tile(col, row + 1);
      c.fillStyle = ["#4c5549", "#3e4847", "#67534b"][act];
      c.fillRect(x, y, 16, 16);
      if (act === 0) {
        c.fillStyle = "#394a42";
        for (const offset of [3, 9]) c.fillRect(x + 1, y + offset, 14, 1);
        c.fillStyle = "#5b6050";
        c.fillRect(x + 2, y + 4, 9, 1);
        if ((col + row) % 3 === 0)
          pixelLine(c, x + 3, y + 2, x + 13, y + 13, "#767762");
      } else if (act === 1) {
        c.fillStyle = "#2f3440";
        c.fillRect(x + 2, y + 1, 12, 8);
        c.fillStyle = "#697268";
        c.fillRect(x + 1, y + 10, 14, 2);
        pixelLine(c, x + 8, y + 10, x + 6, y + 2, "#768d72", 2);
        c.fillStyle = "#526d5e";
        c.fillRect(x + 7, y + 4, 5, 2);
        if ((col + row) % 2 === 0) {
          c.fillStyle = "#9d89aa";
          c.fillRect(x + 3, y + 1, 5, 3);
          c.fillStyle = "#c1adc2";
          c.fillRect(x + 5, y, 2, 1);
        }
      } else {
        c.fillStyle = "#343136";
        c.fillRect(x + 4, y + 3, 9, 9);
        c.fillStyle = "#a48b62";
        c.fillRect(x + 1, y + 2, 2, 2);
        c.fillRect(x + 13, y + 12, 2, 2);
        pixelLine(c, x + 6, y + 7, x + 10, y + 4, "#b49b72");
        c.fillStyle = "#c3a475";
        c.fillRect(x + 7, y + 7, 2, 2);
      }
      if (top) {
        c.fillStyle = ["#67715a", "#646175", "#786050"][act];
        c.fillRect(x, y - 5, 16, 6);
        c.fillStyle = ["#85816a", "#7f7e8a", "#a0855d"][act];
        c.fillRect(x + 1, y - 5, 14, 1);
      }
      if (!tile(col - 1, row)) {
        c.fillStyle = ["#293e42", "#51495c", "#4b3d3d"][act];
        c.fillRect(x, y, 2, 16);
      }
      if (!tile(col + 1, row)) {
        c.fillStyle = ["#263c40", "#51495c", "#4b3d3d"][act];
        c.fillRect(x + 14, y, 2, 16);
      }
      if (bottom) {
        c.fillStyle = ["#263c40", "#51495c", "#4b3d3d"][act];
        c.fillRect(x, y + 14, 16, 2);
        c.fillStyle = ["#10262d90", "#172331a0", "#231f29a0"][act];
        c.fillRect(x, y + 16, 16, 3);
      }
    }
}
