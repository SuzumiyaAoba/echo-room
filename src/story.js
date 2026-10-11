import { Random } from "./math.js";
import { UPGRADES, actIndex, isCamp, roomFeature } from "./content.js";

export const STORIES = [
  {
    id: "bottle",
    act: 0,
    title: "届かなかった手紙",
    icon: "spool",
    text: "瓶の中に、あなたの筆跡がある。『明日は、きっと晴れる』。まだ書いていない言葉だ。宛先は、帰り舟の桟橋。",
    choices: [
      {
        id: "receive",
        label: "昨日を受け取る",
        detail: "体力15を支払い、織片を選ぶ",
        costHp: 15,
        offer: true,
        result: "宛名を胸にしまった。届かなかった昨日が、ミナの糸になった。",
      },
      {
        id: "deliver",
        label: "桟橋に届ける",
        detail: "体力10回復・記憶片5 · 桟橋の記憶",
        heal: 10,
        memory: 5,
        help: true,
        result:
          "船のない桟橋に瓶を置いた。返事はなくても、帰る場所には宛名がある。",
      },
      {
        id: "release",
        label: "明日へ流す",
        detail: "体力25回復",
        heal: 25,
        result: "瓶は街の奥へ流れていった。まだ会わない誰かの明日へ。",
      },
    ],
  },
  {
    id: "diver",
    act: 0,
    title: "名前のない潜水夫",
    icon: "bell",
    text: "『この鈴が鳴る間は、誰かが待っている』。古い潜水服は空っぽだった。裂けた袖には、桟橋の大工の印がある。",
    choices: [
      {
        id: "weave",
        label: "灯りを分ける",
        detail: "歯車30で織片を選ぶ",
        costScrap: 30,
        offer: true,
        result: "鈴が一度鳴った。服の内側から、小さな昨日がこぼれた。",
      },
      {
        id: "mend",
        label: "帰れる服に直す",
        detail: "歯車20を支払い、体力20回復 · 桟橋の記憶",
        costScrap: 20,
        heal: 20,
        help: true,
        result:
          "空の服に帰り道を縫いつけた。大工の印が、ほんの少し温かくなった。",
      },
      {
        id: "listen",
        label: "鈴を聞く",
        detail: "記憶片8を持ち帰る",
        memory: 8,
        result:
          "鳴らない鈴にも、音の記憶はあった。待つ人の名前を、ミナは覚えて帰る。",
      },
    ],
  },
  {
    id: "ticket",
    act: 0,
    title: "最終便の時刻表",
    icon: "clock",
    text: "切符売り場の時計は23時47分。時刻表の最後だけ、時間の代わりに『みんなが揃ったら』と書かれている。",
    choices: [
      {
        id: "wait",
        label: "待つ時間を糸にする",
        detail: "『長い午後』を一つ得る",
        upgrade: "duration",
        result:
          "待った時間は無駄ではなかった。残響が、少し長く灯るようになった。",
      },
      {
        id: "repair",
        label: "明日の欄を作る",
        detail: "歯車15を支払い、記憶片6 · 桟橋の記憶",
        costScrap: 15,
        memory: 6,
        help: true,
        result: "ミナは空白の欄を足した。誰かが明日の便を書けるように。",
      },
      {
        id: "take",
        label: "未使用の切符を拾う",
        detail: "歯車20を得る",
        scrap: 20,
        result:
          "切符の裏には、潮の回廊への印。途中で降りる自由も、旅には必要だ。",
      },
    ],
  },
  {
    id: "garden",
    act: 1,
    title: "一輪だけの春",
    icon: "heart",
    text: "水の底で、一輪の花が揺れている。触れると、知らない家の窓辺を思い出す。根は硝子を割って、まだ伸びようとしていた。",
    choices: [
      {
        id: "pluck",
        label: "花を摘む",
        detail: "最大体力 +10・全回復",
        maxHp: 10,
        heal: 240,
        result: "花は灯守の胸に咲いた。帰るための力を、少しだけ借りた。",
      },
      {
        id: "plant",
        label: "明日の窓辺に植える",
        detail: "体力15を支払い、記憶片10 · 温室の記憶",
        costHp: 15,
        memory: 10,
        help: true,
        result:
          "過去を閉じた硝子から、根を解いた。まだない窓辺へ、花が向いた。",
      },
      {
        id: "remember",
        label: "窓辺を覚える",
        detail: "記憶片12を持ち帰る",
        memory: 12,
        result:
          "誰の窓だったのか、まだ分からない。それでも、忘れないと決めた。",
      },
    ],
  },
  {
    id: "seeds",
    act: 1,
    title: "空っぽの種袋",
    icon: "spool",
    text: "庭師の種袋には、砂と小さな穴だけ。残響を近づけると、昨日の種が透けて見える。土に戻すには、今の手が要る。",
    choices: [
      {
        id: "sow",
        label: "過去の種を土に戻す",
        detail: "歯車20を支払い、体力20回復 · 温室の記憶",
        costScrap: 20,
        heal: 20,
        help: true,
        result: "昨日の種と今日の土。どちらか一つでは、芽は出なかった。",
      },
      {
        id: "stitch",
        label: "穴を縫う",
        detail: "『繕う光』を一つ得る",
        upgrade: "suture",
        result:
          "失ったものの形を縫った。糸で影をほどくたびに、小さな傷も閉じる。",
      },
      {
        id: "carry",
        label: "袋を持ち帰る",
        detail: "歯車18・記憶片3を得る",
        scrap: 18,
        memory: 3,
        result:
          "空の袋は、次に入れるものを待っている。空っぽにも、役目があった。",
      },
    ],
  },
  {
    id: "portrait",
    act: 1,
    title: "硝子に映る食卓",
    icon: "echo",
    text: "硝子の壁に、四人ぶんの食卓が映る。顔はもう見えない。窓辺の鉢だけが、いつまでも同じ春を繰り返している。",
    choices: [
      {
        id: "open",
        label: "窓を開ける",
        detail: "体力10を支払い、歯車25 · 温室の記憶",
        costHp: 10,
        scrap: 25,
        help: true,
        result: "閉じた春に風が入った。食卓の影が、椅子から立ち上がった。",
      },
      {
        id: "stay",
        label: "ひととき席に着く",
        detail: "体力30回復",
        heal: 30,
        result: "誰もいない食卓で休んだ。温かい時間は、確かにここにあった。",
      },
      {
        id: "copy",
        label: "硝子の縁を写す",
        detail: "体力15を支払い、織片を選ぶ",
        costHp: 15,
        offer: true,
        result: "誰かと過ごした輪郭を、ミナの糸に移した。",
      },
    ],
  },
  {
    id: "clock",
    act: 2,
    title: "進めなかった秒針",
    icon: "clock",
    text: "炉の脇に、小さな時計修理台。秒針が進むたび、炉は昨日へ戻そうとする。机には『遅れても、明日は来る』という走り書き。",
    choices: [
      {
        id: "repair",
        label: "秒針を繋ぎ直す",
        detail: "歯車25を支払い、記憶片10 · 灯台の記憶",
        costScrap: 25,
        memory: 10,
        help: true,
        result:
          "一秒だけ時計が進んだ。世界を変えるには、その一秒で十分かもしれない。",
      },
      {
        id: "rhythm",
        label: "刻む速さを覚える",
        detail: "『巻き戻す指』を一つ得る",
        upgrade: "quickecho",
        result:
          "昨日を呼び戻す速さを覚えた。待つことと、進むことは両立できる。",
      },
      {
        id: "rest",
        label: "時計と一緒に休む",
        detail: "体力25回復・記憶片4",
        heal: 25,
        memory: 4,
        result: "一秒の長さを、久しぶりに聞いた。明日は急がなくていい。",
      },
    ],
  },
  {
    id: "song",
    act: 2,
    title: "炉に預けた歌",
    icon: "bell",
    text: "炉の中で、歌の最後の一節が燃えずに残っている。声はたくさんあるのに、続きを知る人がいない。",
    choices: [
      {
        id: "share",
        label: "歌を街へ返す",
        detail: "体力15を支払い、記憶片12 · 灯台の記憶",
        costHp: 15,
        memory: 12,
        help: true,
        result:
          "一人では歌えない続きを、街に預けた。遠くの鈴が同じ調子で鳴った。",
      },
      {
        id: "hum",
        label: "続きを口ずさむ",
        detail: "体力20回復・歯車15",
        heal: 20,
        scrap: 15,
        result:
          "知らない歌の続きを、ミナは自分の声で歌った。間違えても、声は届く。",
      },
      {
        id: "weave",
        label: "声を糸にする",
        detail: "歯車30で織片を選ぶ",
        costScrap: 30,
        offer: true,
        result:
          "重なった声が、一枚の織片になった。灯りは一人だけのものではない。",
      },
    ],
  },
  {
    id: "cradle",
    act: 2,
    title: "もう空ではない灯籠",
    icon: "lighthouse",
    text: "小さな灯籠には、燃料の代わりに帰りたい場所の絵が入っている。最後の一枚は白紙。灯台は、白紙まで燃やそうとしていた。",
    choices: [
      {
        id: "draw",
        label: "帰る場所を描く",
        detail: "歯車20を支払い、最大体力 +10 · 灯台の記憶",
        costScrap: 20,
        maxHp: 10,
        heal: 10,
        help: true,
        result:
          "ミナはまだ朝の来ていない街を描いた。絵の中だけでも、灯りを絶やさない。",
      },
      {
        id: "keep",
        label: "白紙を守る",
        detail: "記憶片15を持ち帰る",
        memory: 15,
        result:
          "描かれていない明日を守った。決まっていないから、選ぶことができる。",
      },
      {
        id: "warm",
        label: "灯籠のそばで温まる",
        detail: "体力35回復",
        heal: 35,
        result: "帰る場所を思い浮かべた。その温かさは、まだ奪われていない。",
      },
    ],
  },
];

export const CITY_PROJECTS = [
  {
    id: "dock",
    act: 0,
    name: "帰り舟の桟橋",
    icon: "bell",
    goal: 5,
    fragment: "wide",
    reward: "はじまりの織片：広がる織目",
    before: "帰る場所を失った舟が、岸の手前で待っている。",
    after: "新しい桟橋に舟が着いた。誰かの昨日が、今日の帰り道になった。",
  },
  {
    id: "garden",
    act: 1,
    name: "明日の温室",
    icon: "heart",
    goal: 5,
    fragment: "suture",
    reward: "はじまりの織片：繕う光",
    before: "硝子は春を守っている。けれど、次の季節の入り口は閉じたまま。",
    after:
      "窓が開き、硝子の花に種ができた。明日の庭は、もう昨日と同じではない。",
  },
  {
    id: "tower",
    act: 2,
    name: "時計のある灯台",
    icon: "clock",
    goal: 5,
    fragment: "quickecho",
    reward: "はじまりの織片：巻き戻す指",
    before: "時計は23時47分を繰り返す。灯台だけが、待つ理由を忘れられない。",
    after:
      "時計が一秒ずつ進んでいる。遅れてくる人のために、灯りは今夜もともる。",
  },
];

export const CITY_MEMORIES = CITY_PROJECTS.flatMap((p) => [
  {
    key: `keeper:${["ferryman", "gardener", "heart"][p.act]}`,
    project: p.id,
    label: "灯りの守り手の記憶",
  },
  ...[3, 4].map((room) => ({
    key: `beacon:${p.act * 8 + room}`,
    project: p.id,
    label: `${room + 1}部屋目の忘れられた灯り`,
  })),
  ...[1, 4].map((room) => ({
    key: `repair:${p.act * 8 + room}`,
    project: p.id,
    label: `${room + 1}部屋目の${roomFeature(p.act * 8 + room).object}`,
  })),
  ...STORIES.filter((s) => s.act === p.act).map((s) => ({
    key: `story:${s.id}`,
    project: p.id,
    label: s.title,
  })),
]);
export const STORY_KEYS = STORIES.flatMap((s) =>
  s.choices.map((c) => `${s.id}:${c.id}`),
);

export function cityProgress(profile, project) {
  const memories = CITY_MEMORIES.filter((m) => m.project === project.id);
  const count = memories.filter((m) =>
    profile.remembered?.includes(m.key),
  ).length;
  return {
    count: Math.min(project.goal, count),
    restored: count >= project.goal,
    memories,
  };
}
export function startingFragments(profile) {
  return CITY_PROJECTS.filter((p) => cityProgress(profile, p).restored).map(
    (p) => p.fragment,
  );
}
export function selectStory(
  run,
  roll = new Random(`${run.seed}:${run.stage}:story`).next(),
) {
  if (!isCamp(run.stage)) return null;
  const pool = STORIES.filter(
    (s) =>
      s.act === actIndex(run.stage) &&
      !(run.journal || []).some((entry) => entry.id === s.id),
  );
  return (
    pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))] || null
  );
}
export function canChooseStory(run, choice) {
  return (
    !!choice &&
    run.hp > (choice.costHp || 0) &&
    run.scrap >= (choice.costScrap || 0) &&
    (!choice.upgrade ||
      (run.upgrades[choice.upgrade] || 0) <
        UPGRADES.find((u) => u.id === choice.upgrade).max) &&
    (!choice.maxHp || run.maxHp < 240)
  );
}
export function applyStoryChoice(game, story, index) {
  const choice = story?.choices[index],
    run = game.run;
  if (
    !isCamp(run.stage) ||
    story?.act !== actIndex(run.stage) ||
    (run.journal || []).some((entry) => entry.stage === run.stage) ||
    !canChooseStory(run, choice)
  )
    return null;
  run.hp -= choice.costHp || 0;
  run.scrap += (choice.scrap || 0) - (choice.costScrap || 0);
  run.memory += choice.memory || 0;
  if (choice.maxHp) run.maxHp = Math.min(240, run.maxHp + choice.maxHp);
  if (choice.heal) game.heal(choice.heal);
  if (choice.upgrade) game.addUpgrade(choice.upgrade);
  (run.journal ||= []).push({
    id: story.id,
    choice: choice.id,
    stage: run.stage,
  });
  return choice;
}

export function settleCity(profile, run, victory) {
  const prior = CITY_PROJECTS.filter(
    (p) => cityProgress(profile, p).restored,
  ).map((p) => p.id);
  const gathered = [
    ...(run.bosses || []).map((id) => `keeper:${id}`),
    ...(run.beacons || []).map((stage) => `beacon:${stage}`),
    ...(run.repairs || []).map((stage) => `repair:${stage}`),
  ];
  for (const entry of run.journal || []) {
    const story = STORIES.find((s) => s.id === entry.id),
      choice = story?.choices.find((c) => c.id === entry.choice);
    if (choice?.help) gathered.push(`story:${story.id}`);
  }
  const allowed = new Set(CITY_MEMORIES.map((m) => m.key));
  const before = new Set(profile.remembered || []);
  profile.remembered = [
    ...new Set([...before, ...gathered.filter((key) => allowed.has(key))]),
  ];
  profile.stories = [
    ...new Set([
      ...(profile.stories || []),
      ...(run.journal || [])
        .map((entry) => `${entry.id}:${entry.choice}`)
        .filter((key) => STORY_KEYS.includes(key)),
    ]),
  ];
  const unlocked = CITY_PROJECTS.filter(
    (p) => cityProgress(profile, p).restored && !prior.includes(p.id),
  );
  const ending = victory
    ? CITY_PROJECTS.every((p) => cityProgress(profile, p).restored) &&
      [0, 1, 2].every((act) =>
        run.beacons?.some((stage) => actIndex(stage) === act),
      )
      ? "chorus"
      : "dawn"
    : null;
  if (ending)
    profile.endings = [...new Set([...(profile.endings || []), ending])];
  return {
    unlocked,
    added: profile.remembered.filter((key) => !before.has(key)),
    ending,
  };
}
