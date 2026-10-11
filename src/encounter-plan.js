import { actIndex, roomIndex, isBoss, isCamp } from "./content.js";
import { Random } from "./math.js";

export const ENCOUNTER_VERSION = 1;
export const REGIONAL_ENCOUNTERS = [
  [
    {
      id: "wharf-pursuit",
      name: "船底の追い足",
      hint: "追う殻と突進を引きつけ、昨日へ戻る道を横切る。",
      stance: "pursuit",
      pattern: [
        "charger",
        "crawler",
        "crawler",
        "charger",
        "crawler",
        "crawler",
        "charger",
        "crawler",
      ],
    },
    {
      id: "wharf-crossfire",
      name: "桟橋の挟み灯",
      hint: "両側の灯が射線を挟む。横へ避け、片側から崩す。",
      stance: "crossfire",
      pattern: [
        "shooter",
        "crawler",
        "shooter",
        "charger",
        "crawler",
        "shooter",
        "crawler",
        "crawler",
      ],
    },
    {
      id: "wharf-shoal",
      name: "潮間の殻群れ",
      hint: "殻の群れへ広い糸を張り、後ろの灯を巻き込む。",
      stance: "pursuit",
      pattern: [
        "crawler",
        "crawler",
        "shooter",
        "charger",
        "crawler",
        "crawler",
        "shooter",
        "crawler",
      ],
    },
  ],
  [
    {
      id: "garden-knot",
      name: "結びの温室",
      hint: "門番に護られた灯と糸喰い。赤い結びを先にほどく。",
      stance: "knot",
      pattern: [
        "weaver",
        "shooter",
        "shield",
        "moth",
        "crawler",
        "moth",
        "shooter",
        "crawler",
      ],
    },
    {
      id: "garden-wings",
      name: "玻璃の翅道",
      hint: "速い蛾が両側から巡る。道を広く録り、糸で捕らえる。",
      stance: "wings",
      pattern: [
        "moth",
        "moth",
        "shooter",
        "crawler",
        "moth",
        "shooter",
        "moth",
        "shield",
      ],
    },
    {
      id: "garden-guard",
      name: "花壇の護り灯",
      hint: "門番の正面を避け、側面の昨日と今で灯を挟む。",
      stance: "guard",
      pattern: [
        "shield",
        "shooter",
        "crawler",
        "moth",
        "shield",
        "shooter",
        "moth",
        "crawler",
      ],
    },
  ],
  [
    {
      id: "furnace-knot",
      name: "炉心の結び",
      hint: "護りと突進が重なる。赤い糸をほどき、放熱する場所を作る。",
      stance: "knot",
      pattern: [
        "weaver",
        "shooter",
        "shield",
        "charger",
        "moth",
        "shooter",
        "moth",
        "shield",
      ],
    },
    {
      id: "furnace-pursuit",
      name: "鍛冶場の追走",
      hint: "衛兵の突進を横へ誘い、残した糸を何度も横切らせる。",
      stance: "pursuit",
      pattern: [
        "charger",
        "charger",
        "moth",
        "shield",
        "charger",
        "moth",
        "shooter",
        "moth",
      ],
    },
    {
      id: "furnace-volley",
      name: "灰灯の斉射",
      hint: "離れた灯が扇を重ねる。片側をほどき、解放で逃げ道を作る。",
      stance: "crossfire",
      pattern: [
        "shooter",
        "shield",
        "shooter",
        "moth",
        "shooter",
        "weaver",
        "moth",
        "shield",
      ],
    },
  ],
];

// Each route offers a different encounter. A separate seed keeps previews and
// repeated visits stable without consuming combat or reward randomness.
export function encounterPlan(run) {
  if (
    run.encounterVersion !== ENCOUNTER_VERSION ||
    !run.stage ||
    isBoss(run.stage) ||
    isCamp(run.stage)
  )
    return null;
  const act = actIndex(run.stage);
  const offset = new Random(`${run.seed}:encounters:${act}`).int(0, 2);
  const route = ["loom", "salvage", "rest"].indexOf(run.route);
  return REGIONAL_ENCOUNTERS[act][
    (offset + roomIndex(run.stage) + Math.max(0, route)) % 3
  ];
}

const ANCHORS = {
  pursuit: [
    [110, 65],
    [370, 65],
    [75, 160],
    [405, 160],
  ],
  crossfire: [
    [70, 65],
    [240, 65],
    [410, 65],
    [75, 160],
  ],
  knot: [
    [110, 65],
    [250, 65],
    [180, 65],
    [405, 160],
  ],
  wings: [
    [75, 65],
    [405, 65],
    [150, 85],
    [330, 85],
  ],
  guard: [
    [180, 65],
    [240, 65],
    [70, 65],
    [410, 65],
  ],
};

export function encounterSpawn(plan, index, right) {
  const [x, y] = ANCHORS[plan.stance][index % 4];
  const mirror = right !== (Math.floor(index / 4) % 2 === 1);
  return { x: mirror ? 480 - x : x, y };
}
