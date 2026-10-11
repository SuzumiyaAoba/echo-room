import { pixelLine } from "../../../src/art.js";
import { actIndex } from "../../../src/content.js";
import { TAU } from "../../../src/math.js";

const rect = (c, color, x, y, w, h) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};

// Scenery uses its own stable pattern, never the encounter/reward RNG.
function pattern(seed) {
  let n = 0;
  for (const letter of seed) n = (n * 31 + letter.charCodeAt(0)) >>> 0;
  return n;
}

export function sceneryRing(c, x, y, r, color) {
  c.fillStyle = color;
  for (let i = 0; i < 64; i++) {
    const angle = (i * TAU) / 64;
    c.fillRect(
      Math.floor(x + Math.cos(angle) * r),
      Math.floor(y + Math.sin(angle) * r),
      1,
      1,
    );
  }
}

function floorTile(c, act, b, x, y, col, row, variant) {
  rect(c, b.floor, x, y, 16, 16);
  if (act === 0) {
    // Weathered planks run across the quay; seams do not form a loud grid.
    rect(c, variant % 2 ? "#283c40" : "#25383d", x, y + 1, 16, 14);
    rect(c, "#192f35", x, y + 7, 16, 1);
    rect(c, "#1b3137", x, y + 15, 16, 1);
    if ((col + row) % 3 === 0) {
      rect(c, "#1a2c32", x + 2, y + 2, 1, 1);
      rect(c, "#42504a", x + 3, y + 2, 1, 1);
    }
    rect(c, "#314448", x + 3, y + (variant % 5) + 1, 8, 1);
    if (variant < 2) rect(c, "#203338", x + 10, y + 9, 1, 5);
  } else if (act === 1) {
    // Glass set into dark stone. Small chips keep the walking plane clear.
    rect(c, variant % 2 ? "#343646" : "#303342", x + 1, y + 1, 15, 15);
    rect(c, "#272c3c", x, y, 16, 1);
    rect(c, "#2a2e3d", x, y, 1, 16);
    if (variant === 1 || variant === 5) {
      pixelLine(c, x + 3, y + 2, x + 9, y + 7, "#434457");
      pixelLine(c, x + 9, y + 7, x + 12, y + 4, "#3c3e51");
      rect(c, "#515068", x + 4, y + 3, 2, 1);
    }
    if (variant === 7) {
      rect(c, "#3c4945", x + 2, y + 11, 5, 3);
      rect(c, "#49574b", x + 3, y + 10, 2, 1);
    }
  } else {
    // Large riveted plates rather than the wharf's individual boards.
    rect(c, variant % 3 ? "#3a3438" : "#40373a", x, y, 16, 16);
    if (row % 2 === 0) rect(c, "#2e2c31", x, y, 16, 1);
    if (col % 2 === 0) rect(c, "#2c2b30", x, y, 1, 16);
    if (col % 2 === 0 && row % 2 === 0) {
      rect(c, "#57473f", x + 2, y + 2, 2, 2);
      rect(c, "#70604b", x + 2, y + 2, 1, 1);
    }
    if (variant < 2) {
      rect(c, "#4b3e3d", x + 5, y + 5, 7, 1);
      rect(c, "#302e32", x + 6, y + 6, 4, 1);
    }
  }
}

function wallTile(c, act, b, x, y, variant) {
  rect(c, "#101f27", x, y + 4, 16, 16);
  rect(c, b.wall, x, y - 5, 16, 16);
  rect(c, ["#56706c", "#6a637c", "#84685d"][act], x + 1, y - 5, 14, 2);
  rect(c, b.dark, x, y + 10, 16, 5);
  rect(c, b.dark, x + 15, y - 3, 1, 13);
  if (act === 0) {
    rect(c, "#253e43", x + 3, y, 3, 10);
    rect(c, "#77806b", x + 3, y + 1, 1, 2);
    if (variant < 4) rect(c, "#40584d", x + 9, y + 8, 5, 2);
  } else if (act === 1) {
    rect(c, "#353449", x + 3, y - 2, 10, 9);
    pixelLine(c, x + 4, y - 1, x + 11, y + 5, "#666378");
    rect(c, "#454951", x + 1, y + 8, 5, 2);
  } else {
    rect(c, "#4b3e3e", x + 4, y - 3, 8, 12);
    rect(c, "#9a7957", x + 6, y - 3, 3, 2);
    rect(c, "#2c2c31", x + 6, y + 2, 4, 5);
    rect(c, "#867157", x + 7, y + 3, 1, 3);
  }
}

function cargo(c, x, y, variant) {
  rect(c, "#10262d90", x - 1, y + 27, 35, 7);
  rect(c, "#263c40", x, y - 5, 32, 37);
  rect(c, "#4c5549", x + 2, y + 2, 28, 27);
  for (let j = 0; j < 4; j++) {
    rect(c, "#394a42", x + 3, y + 5 + j * 6, 26, 1);
    rect(c, "#5b6050", x + 4, y + 6 + j * 6, 10 + (j % 2) * 9, 1);
  }
  rect(c, "#67715a", x + 2, y - 4, 28, 6);
  rect(c, "#85816a", x + 3, y - 4, 26, 1);
  for (const edge of [3, 26]) {
    rect(c, "#293e42", x + edge, y - 2, 3, 32);
    rect(c, "#929078", x + edge, y + 3, 1, 2);
    rect(c, "#929078", x + edge, y + 24, 1, 2);
  }
  pixelLine(c, x + 7, y + 3, x + 25, y + 27, "#767762", 2);
  pixelLine(c, x + 25, y + 3, x + 7, y + 27, "#646d56", 2);
  if (variant % 2) {
    rect(c, "#b4a47d", x + 12, y + 10, 8, 7);
    rect(c, "#596553", x + 14, y + 12, 4, 1);
    rect(c, "#596553", x + 14, y + 14, 2, 1);
  } else {
    sceneryRing(c, x + 16, y - 1, 5, "#a29b72");
    rect(c, "#535e4e", x + 13, y - 1, 6, 2);
  }
}

function planter(c, x, y, variant) {
  rect(c, "#172331a0", x - 1, y + 28, 35, 6);
  rect(c, "#51495c", x, y - 4, 32, 36);
  rect(c, "#646175", x + 1, y - 5, 30, 3);
  rect(c, "#2f3440", x + 3, y - 1, 26, 18);
  rect(c, "#3e4847", x + 2, y + 18, 28, 11);
  rect(c, "#697268", x + 2, y + 17, 28, 3);
  rect(c, "#7f7e8a", x + 1, y + 28, 30, 2);
  for (let i = 0; i < 3; i++) {
    const sx = x + 8 + i * 8,
      height = 10 + ((variant + i * 3) % 7);
    pixelLine(c, sx, y + 18, sx - 2, y + 18 - height, "#657f66", 2);
    rect(c, "#768d72", sx - 5, y + 9, 4, 2);
    rect(c, "#4e695c", sx, y + 12, 5, 2);
    if ((variant + i) % 2) {
      rect(c, "#9d89aa", sx - 4, y + 15 - height, 6, 3);
      rect(c, "#c1adc2", sx - 2, y + 14 - height, 2, 2);
    }
  }
  // The broken glass frame is a solid planter, distinct from the repairable bud.
  pixelLine(c, x + 3, y + 16, x + 3, y - 1, "#838495");
  pixelLine(c, x + 28, y + 16, x + 28, y - 1, "#838495");
  pixelLine(c, x + 3, y + 1, x + 12, y + 10, "#5e6375");
  pixelLine(c, x + 12, y + 10, x + 19, y + 3, "#5e6375");
  rect(c, "#435a4d", x + 5, y + 27, 7, 5);
  rect(c, "#66816a", x + 5, y + 27, 4, 2);
}

function engine(c, x, y, variant) {
  rect(c, "#231f29a0", x - 1, y + 28, 35, 6);
  rect(c, "#4b3d3d", x, y - 5, 32, 37);
  rect(c, "#786050", x + 2, y - 4, 28, 5);
  rect(c, "#a0855d", x + 3, y - 4, 26, 1);
  rect(c, "#67534b", x + 3, y + 2, 26, 27);
  for (const sx of [3, 26]) {
    rect(c, "#a48b62", x + sx, y + 3, 2, 2);
    rect(c, "#a48b62", x + sx, y + 26, 2, 2);
  }
  rect(c, "#343136", x + 9, y + 7, 15, 16);
  sceneryRing(c, x + 16, y + 15, 8, "#9c8058");
  sceneryRing(c, x + 16, y + 15, 5, "#57473e");
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + variant;
    pixelLine(
      c,
      x + 16 + Math.cos(a) * 2,
      y + 15 + Math.sin(a) * 2,
      x + 16 + Math.cos(a) * 7,
      y + 15 + Math.sin(a) * 7,
      "#a28a64",
      2,
    );
  }
  rect(c, "#c3a475", x + 15, y + 14, 3, 3);
  rect(c, "#2d2c32", x + 5, y - 2, 5, 7);
  rect(c, "#8c7458", x + 6, y - 1, 2, 5);
  rect(c, "#b49b72", x + 6, y + 1, 2, 1);
}

function perimeter(c, act) {
  if (act === 0) {
    for (const x of [36, 442])
      for (let y = 65; y < 253; y += 9) {
        rect(c, "#425e59", x, y, 3, 6);
        rect(c, "#1b3338", x + 1, y + 1, 1, 4);
      }
    for (const x of [57, 415])
      for (const y of [56, 257]) {
        rect(c, "#1b3035", x - 5, y + 3, 13, 3);
        rect(c, "#61766a", x - 2, y - 3, 6, 7);
        rect(c, "#98a288", x - 3, y - 4, 8, 2);
        pixelLine(
          c,
          x + 2,
          y + 2,
          x + 19 * (x < 240 ? 1 : -1),
          y + 4,
          "#68755d",
        );
      }
  } else if (act === 1) {
    for (const x of [36, 441])
      for (let y = 50; y < 266; y += 17) {
        pixelLine(c, x, y, x + 3, y + 15, "#4d6554", 2);
        rect(c, "#73806a", x - 3, y + 4, 4, 2);
        rect(c, "#526d5e", x + 2, y + 8, 5, 3);
        if (y % 3 === 0) rect(c, "#9687aa", x, y + 11, 2, 3);
      }
    for (let i = 0; i < 9; i++) {
      const x = 50 + i * 46;
      rect(c, "#586453", x, 36, 1, 9);
      rect(c, "#9b8fa8", x - 2, 34, 5, 3);
      rect(c, "#c1b2c3", x - 1, 34, 1, 1);
    }
  } else {
    for (const y of [48, 263]) {
      rect(c, "#292a30", 47, y, 386, 5);
      rect(c, "#7d6350", 48, y, 384, 3);
      rect(c, "#a3865a", 48, y, 384, 1);
      for (let x = 56; x < 432; x += 37) {
        rect(c, "#393239", x, y - 1, 6, 6);
        rect(c, "#917957", x + 2, y - 2, 2, 7);
      }
    }
    for (const x of [37, 440])
      for (let y = 61; y < 257; y += 10) {
        rect(c, "#292a30", x - 1, y, 5, 6);
        rect(c, "#8c7458", x, y, 3, 1);
        rect(c, "#615445", x + 1, y + 2, 1, 3);
      }
  }
  for (const [x, y] of [
    [43, 46],
    [431, 46],
    [43, 269],
    [431, 269],
  ]) {
    rect(c, "#13232a", x - 4, y - 7, 8, 12);
    rect(c, ["#72b9a8", "#a69bc6", "#bd986f"][act], x - 2, y - 9, 4, 3);
    rect(c, ["#a8d2b4", "#c9badb", "#e0bd88"][act], x - 1, y - 9, 1, 2);
    rect(c, ["#304f4b", "#45405b", "#604b3e"][act], x - 7, y + 6, 14, 1);
  }
}

export function paintScenery(c, game, doors) {
  const act = actIndex(game.run.stage),
    b = game.biome,
    seed = pattern(game.run.seed);
  c.clearRect(0, 0, 480, 300);
  // Draw the whole walking plane before walls/props and their contact shadows.
  for (let row = 0; row < game.tiles.length; row++)
    for (let col = 0; col < game.tiles[row].length; col++) {
      const tile = game.tiles[row][col],
        x = 16 + col * 16,
        y = 16 + row * 16,
        variant = (col * 7 + row * 11 + (seed % 13)) % 9;
      if (tile === 0) floorTile(c, act, b, x, y, col, row, variant);
      else if (tile === 3) {
        rect(c, "#0d2027", x, y, 16, 16);
        doors.push({ x, y });
      } else rect(c, b.floor, x, y, 16, 16);
    }
  for (let row = 0; row < game.tiles.length; row++)
    for (let col = 0; col < game.tiles[row].length; col++)
      if (game.tiles[row][col] === 1)
        wallTile(c, act, b, 16 + col * 16, 16 + row * 16, (col + row) % 9);
  perimeter(c, act);
  for (const [col, row] of game.layout.blocks) {
    if (
      ![0, 1].every((dy) =>
        [0, 1].every((dx) => game.tiles[row + dy]?.[col + dx] === 2),
      )
    )
      continue;
    [cargo, planter, engine][act](
      c,
      16 + col * 16,
      16 + row * 16,
      (col + row + (seed % 7)) % 9,
    );
  }
}

export function drawSceneryAmbient(c, game, settings) {
  const act = actIndex(game.run.stage),
    t = game.t;
  c.save();
  // Quiet motion lives along the perimeter, below every gameplay warning.
  // It follows the room clock, so pause and hidden-tab suspension freeze it.
  if (act === 0) {
    for (let i = 0; i < 8; i++) {
      const x = i % 2 ? 424 : 47,
        y = 69 + i * 23;
      const offset = Math.floor((t * 3 + i * 2) % 9);
      rect(c, "#2d4b4c", x - 4, y + offset, 11, 1);
      rect(c, "#385b58", x - 1, y + offset + 2, 5, 1);
    }
  } else if (act === 1) {
    for (let i = 0; i < 10; i++) {
      const x = (i % 2 ? 423 : 48) + Math.sin(t * 0.3 + i) * 6;
      const y = 62 + ((i * 19 + Math.floor(t * 3)) % 188);
      rect(c, "#736c89", x, y, 2, 1);
      rect(c, "#534f6b", x + 1, y - 1, 1, 1);
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const x = 68 + i * 65,
        y = i % 2 ? 259 : 54;
      const drift = Math.floor((t * 4 + i * 3) % 8);
      rect(c, "#6b5e59", x, y - drift, 3, 2);
      rect(c, "#4e4646", x + 2, y - drift - 2, 3, 1);
    }
  }
  if (settings.flashes)
    for (const x of [43, 431]) {
      c.globalAlpha = 0.06 + Math.sin(t * 0.6 + x) * 0.02;
      rect(c, game.biome.color, x - 8, 36, 16, 14);
    }
  c.restore();
}
