import { ROOM_COUNT, isCamp, isBoss, isElite } from "../src/content.js";
import { Game, createRun } from "../src/game.js";
import { distance, segmentDistance } from "../src/math.js";
import { hazardDanger, canReleaseCounter } from "./pilot-hazards.js";

export const SIMULATION_STYLES = {
  weaving: {
    name: "光糸を保つ",
    releaseAfter: 2.5,
    priority: [
      "double",
      "triangle",
      "counter",
      "thread",
      "suture",
      "damage",
      "quickecho",
      "duration",
      "wide",
      "health",
      "rapid",
      "burst",
      "shield",
    ],
  },
  release: {
    name: "早く解放する",
    releaseAfter: 0.55,
    priority: [
      "burst",
      "refund",
      "cascade",
      "quickecho",
      "double",
      "resonance",
      "damage",
      "health",
      "shield",
      "wide",
      "rapid",
    ],
  },
  shooting: {
    name: "残響の射撃を重ねる",
    releaseAfter: 3.5,
    priority: [
      "damage",
      "rapid",
      "echopower",
      "crit",
      "pierce",
      "homing",
      "double",
      "quickecho",
      "health",
      "shield",
      "duration",
    ],
  },
  footwork: {
    name: "回避で糸を横切る",
    releaseAfter: 2.5,
    priority: [
      "dashthread",
      "dashshot",
      "dash",
      "thread",
      "wide",
      "quickecho",
      "speed",
      "double",
      "suture",
      "health",
      "shield",
      "damage",
    ],
  },
};

export function simulate(
  seed,
  {
    echo = true,
    difficulty = 0,
    weapon = "needle",
    relic = "spool",
    style = "weaving",
    singleStage = null,
    maxSeconds = 180,
    rewardChoices = {},
    route = "loom",
    GameClass = Game,
    createRunFn = createRun,
  } = {},
) {
  const policy = SIMULATION_STYLES[style];
  if (!policy) throw new Error(`Unknown simulation style: ${style}`);
  if (!["loom", "salvage", "rest"].includes(route))
    throw new Error(`Unknown simulation route: ${route}`);
  const run = createRunFn(seed, weapon, relic, difficulty);
  const damage = {},
    choices = [],
    encounters = [];
  let releases = 0,
    dashes = 0;
  if (singleStage !== null) run.stage = singleStage;
  const endStage = singleStage === null ? ROOM_COUNT : run.stage + 1;
  let rooms = 0,
    failed = false,
    reason = "",
    seconds = 0;
  for (let stage = run.stage; stage < endStage; stage++) {
    run.stage = stage;
    run.route = isCamp(stage) ? "rest" : stage === 0 ? "loom" : route;
    const g = new GameClass(run);
    // Observe actual damage after armor/ward/collision checks. The production
    // method still applies every hit, death, reward, and recovery normally.
    const applyDamage = g.damageEnemy.bind(g);
    g.damageEnemy = (enemy, amount, source, critical) => {
      const before = Math.max(0, enemy.hp);
      applyDamage(enemy, amount, source, critical);
      const dealt = before - Math.max(0, enemy.hp);
      damage[source] = (damage[source] || 0) + dealt;
    };
    const release = g.release.bind(g),
      dash = g.dash.bind(g);
    g.release = () => {
      releases++;
      release();
    };
    g.dash = (mx, my) => {
      dashes++;
      dash(mx, my);
    };
    if (isCamp(stage)) {
      g.heal(g.run.maxHp);
      rooms++;
      continue;
    }
    for (let tick = 0; tick < maxSeconds * 60; tick++) {
      const p = g.player,
        t = tick / 60,
        phase = t * 0.6;
      const target = {
        x: 240 + Math.cos(phase) * 152,
        y: 156 + Math.sin(phase) * 91,
      };
      let mx = target.x - p.x,
        my = target.y - p.y;
      // Basic steering, with no access to enemy intent or damage shortcuts.
      for (const e of g.enemies) {
        const d = distance(e, p);
        if (d < e.r + 32) {
          mx += (p.x - e.x) * 4;
          my += (p.y - e.y) * 4;
        }
      }
      const angle = Math.atan2(my, mx);
      mx = Math.cos(angle);
      my = Math.sin(angle);
      if (g.solid(p.x + mx * 12, p.y + my * 12, p.r)) {
        mx = Math.cos(angle + 1.1);
        my = Math.sin(angle + 1.1);
      }
      const danger =
        g.bullets.some(
          (b) =>
            !b.friendly &&
            segmentDistance(p, b, {
              x: b.x + b.vx * 0.2,
              y: b.y + b.vy * 0.2,
            }) < 10,
        ) ||
        g.enemies.some((e) => distance(e, p) < e.r + 13) ||
        g.hazards.some((h) => hazardDanger(h, p));
      const releaseNow =
        echo &&
        g.echoes.some(
          (e) =>
            e.elapsed > policy.releaseAfter &&
            (g.enemies.some(
              (n) => distance(e, n) < g.stats.burstRadius + n.r,
            ) ||
              canReleaseCounter(g, e)),
        );
      g.update(1 / 60, {
        mx,
        my,
        fire: true,
        autoAim: true,
        echo: echo && tick % 20 === 0,
        dash:
          danger ||
          (style === "footwork" &&
            run.upgrades.dashthread &&
            g.enemies.some((e) =>
              g
                .threads()
                .some(
                  ([a, b]) =>
                    distance(a, b) > 10 &&
                    segmentDistance(e, a, b) < e.r + g.stats.threadWidth,
                ),
            )),
        burst: releaseNow,
      });
      if (g.mode === "reward") {
        rooms++;
        seconds += g.roomTime;
        break;
      }
      if (g.mode === "dead") {
        failed = true;
        reason = "death";
        seconds += g.roomTime;
        break;
      }
      if (tick === maxSeconds * 60 - 1) {
        failed = true;
        reason = "timeout";
        seconds += g.roomTime;
      }
    }
    encounters.push({
      stage,
      hp: Math.ceil(run.hp),
      seconds: Number(g.roomTime.toFixed(2)),
      outcome: failed ? reason : "clear",
    });
    if (failed) break;
    g.collectAllScrap();
    if (stage === ROOM_COUNT - 1) continue;
    if (run.route === "rest") g.heal(30);
    else if (run.route === "salvage") run.scrap += 35;
    if (run.route !== "loom" && !isBoss(stage) && !isElite(stage)) continue;
    const priority = policy.priority;
    const offer = g
      .offer()
      .sort(
        (a, b) =>
          (priority.indexOf(a.id) < 0 ? 99 : priority.indexOf(a.id)) -
          (priority.indexOf(b.id) < 0 ? 99 : priority.indexOf(b.id)),
      );
    const chosen = Object.hasOwn(rewardChoices, stage)
      ? offer.find((u) => u.id === rewardChoices[stage])
      : offer[0];
    if (Object.hasOwn(rewardChoices, stage) && !chosen)
      throw new Error(
        `Stage ${stage}: ${rewardChoices[stage]} was not offered`,
      );
    if (chosen) {
      g.addUpgrade(chosen.id);
      choices.push({ stage, id: chosen.id, offered: offer.map((u) => u.id) });
    }
  }
  return {
    seed,
    echo,
    difficulty,
    weapon,
    relic,
    style,
    rooms,
    failed,
    reason,
    stage: run.stage,
    hp: Math.ceil(run.hp),
    seconds: Math.round(seconds),
    kills: run.kills,
    threadKills: run.threadKills,
    threadCuts: run.threadCuts,
    threadReturns: run.threadReturns,
    casts: run.echoesCast,
    cordCuts: run.cordCuts,
    memoryCuts: run.memoryCuts,
    prismSplits: run.prismSplits,
    needleStitches: run.needleStitches,
    damageTaken: Number(run.damageTaken.toFixed(2)),
    releases,
    dashes,
    damage: Object.fromEntries(
      Object.entries(damage).map(([source, amount]) => [
        source,
        Number(amount.toFixed(2)),
      ]),
    ),
    choices,
    encounters,
    upgrades: run.upgrades,
  };
}
if (process.argv[1]?.endsWith("simulate.js")) {
  const samples = Number(process.argv[2] || 10);
  const rows = [];
  for (let i = 0; i < samples; i++)
    for (const echo of [false, true])
      rows.push(simulate(`BALANCE-${i}`, { echo }));
  console.log(JSON.stringify(rows, null, 2));
}
