const P = {
  ".": "transparent",
  o: "#0a141c",
  n: "#192832",
  d: "#31444c",
  g: "#658c89",
  t: "#79d8c3",
  w: "#e0ead7",
  s: "#e5b985",
  c: "#bc7b5a",
  r: "#cd735e",
  b: "#537a87",
  p: "#b59bcd",
  v: "#615778",
  y: "#e9cf91",
};
const HIT_P = {
  ...P,
  o: "#203039",
  n: "#43565e",
  d: "#81978d",
  g: "#b2cdbc",
  t: "#c9efcf",
  w: "#fff4da",
  s: "#f6d5a9",
  c: "#d5ae8d",
  r: "#efbea1",
  b: "#a8c9c3",
  p: "#dccde6",
  v: "#a295b0",
  y: "#fff0b2",
};
const ECHO_P = {
  ...P,
  o: "#163d42",
  n: "#286a6b",
  b: "#429a91",
  r: "#8adecd",
  s: "#b9f7dc",
  w: "#defef0",
  c: "#79d8c3",
};
const STOLEN_P = {
  ...P,
  o: "#482e43",
  n: "#6b3e59",
  b: "#af697f",
  r: "#ed9ca0",
  s: "#f7c4b1",
  w: "#ffe0c3",
  c: "#db8c98",
  t: "#f0b0a3",
};
const SPRITES = {
  player: [
    "......oooo......",
    ".....onnnno.....",
    "....onbbb bno...".replace(/ /g, "b"),
    "....onwsswno....",
    ".....osssso.....",
    "......occo......",
    "....oorrrroo....",
    "...onrrrrrrno...",
    "...onnbbbbnno...",
    "...osnbbbbnso...",
    "....onbbbnno....",
    ".....obbbbo.....",
    ".....obbbbo.....",
    "....onnonno.....",
    "....onooono.....",
    "....ooo.ooo.....",
  ],
  crawler: [
    "................",
    "................",
    ".....oooooo.....",
    "...ooccccccoo...",
    "..occggggggcco..",
    "..ocggdggdggco..",
    "..ocggggggggco..",
    "..ocggswwsggco..",
    "...ocggoogco....",
    "..oonooooono....",
    "..onno....onno..",
    ".ooo........ooo.",
  ],
  shooter: [
    ".....oooooo.....",
    "....onssssno....",
    "...onsyyyy sno...".replace(/ /g, "s"),
    "...osyywwy yso...".replace(/ /g, "y"),
    "...onsyyyysno...",
    "....onssssno....",
    ".....onnnno.....",
    "....onnnnnno....",
    "...onnnbbnnno...",
    "....onbbbnno....",
    ".....onbno......",
    "....oodddoo.....",
    "...odddddddo....",
    "..ooooooooooo...",
  ],
  charger: [
    ".....oooooo.....",
    "....onrrrrno....",
    "...onrrrrrrno...",
    "...onrwwwwrno...",
    "....onrrrrno....",
    ".....onnnno.....",
    "..ooonddddnooo..",
    ".odddnrrrrndddo.",
    ".odddnrrrrndddo.",
    "..ooo nddn ooo..".replace(/ /g, "n"),
    "....onddddno....",
    "....onddddno....",
    "....onnoonno....",
    "...onnnoonnno...",
    "...oooo.oooo....",
  ],
  shield: [
    "....oooooooo....",
    "...oggggggggo...",
    "..ogttttttttgo..",
    ".ogttggggggttgo.",
    ".ogtggggggggtgo.",
    ".ogtggwwwwggtgo.",
    ".ogtgggssgggtgo.",
    ".ogtgggoogggtgo.",
    ".ogttggggggttgo.",
    "..ogttttttttgo..",
    "...oggggggggo...",
    "....onnnnnno....",
    "...onnnoonnno...",
    "...oooo..oooo...",
  ],
  moth: [
    "................",
    "..pp........pp..",
    ".pwwp......pwwp.",
    "pwwwvp.oo.pvwwwp",
    "pwwvvpovvopvvwwp",
    ".pvvvo ww ovvvp.".replace(/ /g, "v"),
    "..pvvo ww ovvp..".replace(/ /g, "v"),
    "...pvo vv ovp...".replace(/ /g, "v"),
    "..pp..ovvo..pp..",
    "......ovvo......",
    ".......oo.......",
  ],
  weaver: [
    ".....oooooo.....",
    "....ovvvvvvo....",
    "...ovppppppvo...",
    "...ovpwwwwpvo...",
    "....ovppppvo....",
    ".....ovvvvo.....",
    "....ovppppvo....",
    "...ovppppppvo...",
    "..ovppvvvvppvo..",
    "...ovpvvvvpvo...",
    "....ovvvvvvo....",
    "...ovvooovvvo...",
    "..ovvo...ovvvo..",
    ".oooo.....oooo..",
  ],
  ferryman: [
    "........oooo........",
    "......oonnnnoo......",
    ".....onssssssno.....",
    "....onssssssssno....",
    "....onsswwwwssno....",
    ".....onssssssno.....",
    "......oonnnoo.......",
    "....ooonbbnnooo.....",
    "...onbbbbbbbbbbno...",
    "..onbbggggggggbbno..",
    "..onbggggggggggbno..",
    "..onbggggggggggbno..",
    "..onsggggggggggsno..",
    "..onsooggggggoosno..",
    "...oo.ogggggo.oo....",
    "......ogggggo.......",
    ".....onbggbbno......",
    "....onnbggbbnno.....",
    "....onnooonnnno.....",
    "....ooo...ooooo.....",
  ],
  gardener: [
    "........pp........",
    "......ppwwpp......",
    "....ppwwwwwwpp....",
    "...pvwwwwwwwwvp...",
    "..pvwwvwwwwvwwvp..",
    "..pvwwvwwwwvwwvp..",
    "...pvwwwwwwwwvp...",
    ".....pvooovp......",
    ".....ovpppvo......",
    "...ooovpppvooo....",
    "..ovpppppppppvo...",
    ".ovppvvvvvvpppvo..",
    ".ovppvvvvvvpppvo..",
    "..ovpvvvvvvp pvo..".replace(/ /g, "p"),
    "...ovvvvvvvvvo....",
    "....ovvvvvvvo.....",
    "...ovvvvvvvvvo....",
    "..ovvvoooovvvvo...",
    ".ooooo....oooooo..",
  ],
  heart: [
    "......oooooo......",
    "....ooccccccoo....",
    "...ocrssssssrco...",
    "..ocrs yyy y srco..".replace(/ /g, "s"),
    "..ocsyo o oysco...".replace(/ /g, "y"),
    ".ocrsyoywyoysrco..",
    ".ocrsyowwwoysrco..",
    ".ocrsyoywyoysrco..",
    "..ocsyo o oysco...".replace(/ /g, "y"),
    "..ocrs yyy y srco..".replace(/ /g, "s"),
    "...ocrssssssrco...",
    "....ooccccccoo....",
    ".....onccccno.....",
    "...ooonccccnooo...",
    "..onnnnccccnnnno..",
    ".onnnnoooo nnnnno.".replace(/ /g, "n"),
    ".oooooo...ooooooo.",
  ],
};
const PLAYER_STEPS = [
  SPRITES.player,
  [
    ...SPRITES.player.slice(0, 13),
    "....onno.no.....",
    "....onn.o.no....",
    "....ooo..oo.....",
  ],
  [
    ...SPRITES.player.slice(0, 13),
    ".....ononno.....",
    ".....ooo.no.....",
    ".........oo.....",
  ],
  [
    ...SPRITES.player.slice(0, 13),
    "....on.onno.....",
    "...on.o.ono.....",
    "...oo...ooo.....",
  ],
];
const MOTH_CLOSED = [
  "................",
  "................",
  "...pp......pp...",
  "..pwwpooopwwp...",
  "..pvvvovvovvvp..",
  "...pvowwwovvp...",
  "....vowwwovv....",
  ".....ovvvo......",
  "......ovvo......",
  "......ovvo......",
  ".......oo.......",
];
export function bitmap(ctx, rows, x, y, palette = P, scale = 1) {
  rows.forEach((row, iy) =>
    [...row].forEach((c, ix) => {
      const color = palette[c];
      if (color && color !== "transparent") {
        ctx.fillStyle = color;
        const px = Math.floor(x + ix * scale),
          py = Math.floor(y + iy * scale);
        ctx.fillRect(
          px,
          py,
          Math.floor(x + (ix + 1) * scale) - px,
          Math.floor(y + (iy + 1) * scale) - py,
        );
      }
    }),
  );
}
const spriteLayers = new WeakMap();
function spriteLayer(rows, palette, scale) {
  let palettes = spriteLayers.get(rows);
  if (!palettes) spriteLayers.set(rows, (palettes = new Map()));
  let scales = palettes.get(palette);
  if (!scales) palettes.set(palette, (scales = new Map()));
  if (scales.has(scale)) return scales.get(scale);
  const width = Math.max(...rows.map((row) => row.length));
  const x = (-width * scale) / 2,
    y = -rows.length * scale + 5;
  const left = Math.floor(x),
    top = Math.floor(y);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale) + 1;
  canvas.height = Math.ceil(rows.length * scale) + 1;
  const context = canvas.getContext("2d");
  context.translate(-left, -top);
  bitmap(context, rows, x, y, palette, scale);
  const layer = { canvas, left, top };
  scales.set(scale, layer);
  return layer;
}
export function sprite(
  ctx,
  name,
  x,
  y,
  {
    scale = 1,
    echo = false,
    stolen = false,
    flash = false,
    walk = 0,
    flip = false,
    moving = false,
    idle = 0,
  } = {},
) {
  const rows =
    name === "player" && moving
      ? PLAYER_STEPS[Math.floor(walk) % PLAYER_STEPS.length]
      : name === "moth" && Math.floor(walk * 2) % 2
        ? MOTH_CLOSED
        : SPRITES[name] || SPRITES.crawler;
  const palette = flash ? HIT_P : stolen ? STOLEN_P : echo ? ECHO_P : P;
  ctx.save();
  if (echo) ctx.globalAlpha = 0.7;
  ctx.translate(Math.floor(x), Math.floor(y));
  if (flip) ctx.scale(-1, 1);
  if (name === "player") {
    const flutter = Math.floor(moving ? walk : idle * 2) % 3;
    ctx.fillStyle = palette.o;
    ctx.fillRect(-10, -6 + flutter, 8, 3);
    ctx.fillStyle = palette.r;
    ctx.fillRect(-9, -5 + flutter, 7, 1);
  }
  const bob = Math.round(
    Math.sin(name === "player" ? (moving ? (walk * Math.PI) / 2 : 0) : walk) *
      0.6,
  );
  if (ctx.globalAlpha === 1) {
    const layer = spriteLayer(rows, palette, scale);
    ctx.drawImage(layer.canvas, layer.left, layer.top + bob);
  } else {
    // Native drawImage and fillRect round translucent colors differently.
    // Preserve the original echo and invulnerability pixels exactly.
    const width = Math.max(...rows.map((row) => row.length));
    bitmap(
      ctx,
      rows,
      (-width * scale) / 2,
      -rows.length * scale + 5 + bob,
      palette,
      scale,
    );
  }
  ctx.restore();
}
export function pixelLine(ctx, x0, y0, x1, y1, color, width = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  let dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1,
    dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1,
    err = dx + dy;
  ctx.fillStyle = color;
  // Merge consecutive pixels in a row or column without allocating paths.
  // Short lines and translucent overlapping strokes retain individual fills.
  const longest = Math.max(dx, -dy);
  const canMerge =
    longest >= 16 &&
    Math.min(dx, -dy) < longest &&
    Number.isInteger(width) &&
    width > 0 &&
    (width === 1 || (ctx.globalAlpha === 1 && /^#[0-9a-f]{6}$/i.test(color)));
  const transform = canMerge ? ctx.getTransform() : null;
  const batch =
    canMerge &&
    transform.a === 1 &&
    transform.b === 0 &&
    transform.c === 0 &&
    transform.d === 1 &&
    Number.isInteger(transform.e) &&
    Number.isInteger(transform.f) &&
    ctx.globalCompositeOperation === "source-over" &&
    ctx.shadowBlur === 0 &&
    ctx.shadowOffsetX === 0 &&
    ctx.shadowOffsetY === 0 &&
    ctx.shadowColor === "rgba(0, 0, 0, 0)" &&
    (!ctx.filter || ctx.filter === "none");
  const offset = Math.floor(width / 2);
  const horizontal = dx >= -dy;
  let startX = x0,
    startY = y0,
    lastX = x0,
    lastY = y0;
  const flush = () =>
    ctx.fillRect(
      Math.min(startX, lastX) - offset,
      Math.min(startY, lastY) - offset,
      Math.abs(lastX - startX) + width,
      Math.abs(lastY - startY) + width,
    );
  for (let i = 0; i < 1200; i++) {
    if (batch) {
      if (horizontal ? y0 !== startY : x0 !== startX) {
        flush();
        startX = x0;
        startY = y0;
      }
      lastX = x0;
      lastY = y0;
    } else ctx.fillRect(x0 - offset, y0 - offset, width, width);
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
  if (batch) flush();
}
export const ICONS = {
  rewind: [
    "...tttttt...",
    "..t......t..",
    ".yt......t..",
    "yyy......t..",
    ".y.......t..",
    "..t......t..",
    "...tttttt...",
    ".....y......",
    "....yyy.....",
  ],
  spool: [
    "...oooooo...",
    "..oyyyyyyo..",
    "...oyyyyo...",
    "...otttto...",
    "...otttto...",
    "...otttto...",
    "...oyyyyo...",
    "..oyyyyyyo..",
    "...oooooo...",
  ],
  echo: [
    "....tttt....",
    "...t....t...",
    "...t.tt.t...",
    "...t....t...",
    "....tttt....",
    "..tttttttt..",
    "..t..tt..t..",
    ".....tt.....",
    "....t..t....",
  ],
  thread: [
    ".t........t.",
    "..t......t..",
    "...t....t...",
    "....t..t....",
    ".....tt.....",
    "....t..t....",
    "...t....t...",
    "..t......t..",
    ".t........t.",
  ],
  triangle: [
    ".....tt.....",
    "....t..t....",
    "....t..t....",
    "...t....t...",
    "...t....t...",
    "..t......t..",
    "..t......t..",
    ".tttttttttt.",
  ],
  heart: [
    "..rr...rr...",
    ".rrrr.rrrr..",
    ".rrrrrrrrr..",
    ".rrrrrrrrr..",
    "..rrrrrrr...",
    "...rrrrr....",
    "....rrr.....",
    ".....r......",
  ],
  needle: [
    ".........yy.",
    "........yy..",
    ".......yy...",
    "......yy....",
    ".....yy.....",
    "....yy......",
    "...yy.......",
    "..yy........",
    ".y..........",
  ],
  star: [
    ".....yy.....",
    ".....yy.....",
    "....yyyy....",
    ".yyyyyyyyyy.",
    "...yyyyyy...",
    "....yyyy....",
    "...yy..yy...",
    "..yy....yy..",
  ],
  dash: [
    "......tt....",
    ".....tt.....",
    "....tt......",
    "...tttttt...",
    "......tt....",
    ".....tt.....",
    "....tt......",
    "...tt.......",
  ],
  shield: [
    "..bbbbbbbb..",
    "..bwwwwwwb..",
    "..bwwwwwwb..",
    "..bwwwwwwb..",
    "...bwwwwb...",
    "...bwwwwb...",
    "....bwwb....",
    ".....bb.....",
  ],
  scrap: [
    "....yyyy....",
    "..yyccccyy..",
    "..yccccccy..",
    ".ycccyycccy.",
    ".ycccyycccy.",
    "..yccccccy..",
    "..yyccccyy..",
    "....yyyy....",
  ],
  clock: [
    "...yyyyyy...",
    "..y......y..",
    ".y...y....y.",
    ".y...y....y.",
    ".y...yyy..y.",
    ".y........y.",
    "..y......y..",
    "...yyyyyy...",
  ],
  bell: [
    "....yyyy....",
    "...yccccy...",
    "...yccccy...",
    "..yccccccy..",
    "..yccccccy..",
    ".yyyyyyyyyy.",
    ".....yy.....",
  ],
  ember: [
    "......r.....",
    ".....rr.....",
    "..r..ryr....",
    "..rrryyrr...",
    "..rryyyyrr..",
    "...ryyyyr...",
    "....ryyr....",
    ".....rr.....",
  ],
  lighthouse: [
    ".....yy.....",
    "....yyyy....",
    "..tttttttt..",
    "....tyyt....",
    "....tttt....",
    "....tyyt....",
    "....tttt....",
    "...tttttt...",
    "..tttttttt..",
  ],
};
const iconCache = new Map();
export function iconUrl(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  bitmap(ctx, ICONS[name] || ICONS.star, 4, 6, P, 2);
  const url = canvas.toDataURL();
  iconCache.set(name, url);
  return url;
}
