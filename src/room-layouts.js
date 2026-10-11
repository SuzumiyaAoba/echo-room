import { ROOM_LAYOUTS, actIndex, isBoss, isCamp } from "./content.js";

export const ROOM_LAYOUT_VERSION = 2;

// One existing seeded draw selects the shape. Geometry never consumes combat
// randomness; old expeditions continue using the original eight layouts.
export const REGIONAL_LAYOUTS = [
  [
    {
      id: "wharf-piers",
      name: "双子の桟橋",
      hint: "長い荷箱の両側へ、残響と今を分ける。",
      walls: [
        [6, 5, 2, 6],
        [20, 5, 2, 6],
      ],
    },
    {
      id: "wharf-steps",
      name: "雁木の路",
      hint: "段違いの荷箱を回り、曲がった道を録画する。",
      walls: [
        [6, 4, 2, 2],
        [8, 6, 2, 2],
        [18, 8, 2, 2],
        [20, 10, 2, 2],
      ],
    },
    {
      id: "wharf-crossing",
      name: "係留の十字",
      hint: "横の荷列を越えて、糸の向きを変える。",
      walls: [
        [8, 6, 4, 2],
        [16, 6, 4, 2],
        [6, 10, 2, 2],
        [20, 10, 2, 2],
      ],
    },
    {
      id: "wharf-lowtide",
      name: "干潮の寄り場",
      hint: "折れた岸を回り、離れた場所から撃ち返す。",
      walls: [
        [5, 5, 2, 6],
        [7, 5, 4, 2],
        [17, 9, 6, 2],
        [21, 11, 2, 2],
      ],
    },
    {
      id: "wharf-islands",
      name: "荷繰りの島",
      hint: "荷箱の島を渡り、射線と糸を交互に作る。",
      walls: [
        [8, 5, 2, 3],
        [18, 9, 2, 3],
        [5, 10, 3, 2],
        [20, 4, 3, 2],
      ],
    },
    {
      id: "wharf-lock",
      name: "水門の隙間",
      hint: "中央の隙間か外の道へ、敵を誘う。",
      walls: [
        [6, 8, 6, 2],
        [16, 8, 6, 2],
      ],
    },
  ],
  [
    {
      id: "garden-clover",
      name: "四葉の花壇",
      hint: "四つの花壇を巡り、広い糸を張る。",
      walls: [
        [8, 5, 3, 2],
        [17, 5, 3, 2],
        [8, 10, 3, 2],
        [17, 10, 3, 2],
      ],
    },
    {
      id: "garden-seeds",
      name: "種子の回廊",
      hint: "花壇の折り返しへ、昨日の射撃を残す。",
      walls: [
        [5, 5, 2, 5],
        [9, 9, 3, 2],
        [20, 7, 2, 5],
        [16, 5, 3, 2],
      ],
    },
    {
      id: "garden-spiral",
      name: "螺旋の苗床",
      hint: "大きな苗床の外を回り、入口と出口を結ぶ。",
      walls: [
        [10, 4, 8, 2],
        [10, 6, 2, 2],
        [16, 8, 2, 2],
      ],
    },
    {
      id: "garden-path",
      name: "温室の小径",
      hint: "横長の花壇の両側で、射撃を分ける。",
      walls: [
        [5, 6, 5, 2],
        [18, 6, 5, 2],
        [8, 11, 3, 2],
        [17, 11, 3, 2],
      ],
    },
    {
      id: "garden-vines",
      name: "蔓の中庭",
      hint: "ずれた花壇に沿い、曲がる残響を織る。",
      walls: [
        [6, 4, 2, 3],
        [8, 7, 2, 3],
        [18, 6, 2, 3],
        [20, 9, 2, 3],
      ],
    },
    {
      id: "garden-night",
      name: "夜咲きの輪",
      hint: "花壇の輪を巡り、囲まれる前に糸を返す。",
      walls: [
        [9, 4, 2, 2],
        [17, 4, 2, 2],
        [6, 8, 2, 2],
        [20, 8, 2, 2],
        [9, 11, 2, 2],
        [17, 11, 2, 2],
      ],
    },
  ],
  [
    {
      id: "engine-teeth",
      name: "織機の歯列",
      hint: "交互の機械列へ、残響を置き分ける。",
      walls: [
        [6, 5, 2, 4],
        [10, 7, 2, 4],
        [16, 5, 2, 4],
        [20, 7, 2, 4],
      ],
    },
    {
      id: "engine-vents",
      name: "放熱の脇道",
      hint: "長い機械の外側から、射線を通す。",
      walls: [
        [7, 5, 3, 6],
        [18, 5, 3, 6],
      ],
    },
    {
      id: "engine-beams",
      name: "炉心の横架",
      hint: "機械列の切れ目へ、敵と糸を集める。",
      walls: [
        [6, 8, 6, 2],
        [16, 8, 6, 2],
      ],
    },
    {
      id: "engine-valves",
      name: "弁の折返し",
      hint: "弁を回る道を録画し、向こう側から織る。",
      walls: [
        [6, 5, 2, 5],
        [8, 8, 3, 2],
        [19, 5, 2, 5],
        [16, 5, 3, 2],
      ],
    },
    {
      id: "engine-embers",
      name: "燃えさしの棚",
      hint: "離れた機械の棚へ、射撃の残響を置く。",
      walls: [
        [5, 4, 4, 2],
        [19, 4, 4, 2],
        [8, 10, 3, 2],
        [17, 10, 3, 2],
      ],
    },
    {
      id: "engine-clock",
      name: "時計の欠歯",
      hint: "欠けた輪の中と外へ、糸を張り替える。",
      walls: [
        [7, 5, 2, 2],
        [11, 4, 2, 2],
        [17, 5, 2, 2],
        [19, 9, 2, 2],
        [7, 11, 2, 2],
        [15, 11, 2, 2],
      ],
    },
  ],
];

export function chooseRoomLayout(run, rng) {
  if (run.stage === 0) return ROOM_LAYOUTS[0];
  const pool =
    run.layoutVersion === ROOM_LAYOUT_VERSION &&
    !isBoss(run.stage) &&
    !isCamp(run.stage)
      ? REGIONAL_LAYOUTS[actIndex(run.stage)]
      : ROOM_LAYOUTS;
  return rng.pick(pool);
}

export function layoutWalls(layout) {
  return layout.walls || layout.blocks.map(([x, y]) => [x, y, 2, 2]);
}

export function reserveRoomEntry(tiles, run) {
  if (run.layoutVersion !== ROOM_LAYOUT_VERSION) return;
  const centers = [
    { x: 240, y: 235 },
    { x: 240, y: 43 },
  ];
  if ([3, 4].includes(run.stage % 8)) centers.push({ x: 240, y: 156 });
  for (let y = 1; y < tiles.length - 1; y++)
    for (let x = 1; x < tiles[y].length - 1; x++)
      if (
        tiles[y][x] === 2 &&
        centers.some(
          (p) => Math.hypot(24 + x * 16 - p.x, 24 + y * 16 - p.y) < 20,
        )
      )
        tiles[y][x] = 0;
}

export function roomSpawnPoint(game, desired, positions, radius) {
  if (!game.solid(desired.x, desired.y, radius)) return desired;
  const candidates = positions.filter((p) => !game.solid(p.x, p.y, radius));
  // The authored shapes leave the entrance and upper rim connected. Keep a
  // bounded deterministic fallback for future shapes, without a random draw.
  if (!candidates.length)
    for (let y = 56; y <= 168; y += 16)
      for (let x = 56; x <= 424; x += 16)
        if (!game.solid(x, y, radius)) candidates.push({ x, y });
  const point = candidates.sort(
    (a, b) =>
      Math.hypot(a.x - desired.x, a.y - desired.y) -
      Math.hypot(b.x - desired.x, b.y - desired.y),
  )[0];
  if (!point) throw new Error("Room has no safe enemy entry");
  return point;
}

export function roomLayoutPreview(game) {
  return {
    id: game.layout.id || `legacy-${ROOM_LAYOUTS.indexOf(game.layout)}`,
    name: game.layout.name,
    hint: game.layout.hint || "遮蔽物を回り、射線と光糸を作る。",
    tiles: game.tiles.map((row) => [...row]),
  };
}
