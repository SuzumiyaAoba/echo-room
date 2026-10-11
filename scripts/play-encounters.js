import { developmentOrigin, developmentURL } from "./browser-url.js";
import { observationDirectory } from "./observation-files.js";
import { chromium } from "@playwright/test";
import { createRun } from "../src/game.js";
import { freshProfile, SAVE_KEY } from "../src/save.js";
import { writeFileSync } from "node:fs";

const browser = await chromium.launch({ headless: true });
const errors = [],
  observations = [];
const artifact = observationDirectory;
const tag = process.argv.find((arg) => arg.startsWith("--tag="))?.slice(6);
if (tag && !/^[a-z0-9-]+$/.test(tag))
  throw new Error("Expected a simple artifact tag");
const selected = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--tag="))
  .map(Number);
if (
  selected.some((stage) => !Number.isInteger(stage) || stage < 0 || stage > 23)
)
  throw new Error("Expected room stages between zero and twenty-three");
const prefix = tag ? `${tag}-` : "";
const stages = selected.length ? selected : [1, 9, 17, 7, 15, 23];
// Start at a room checkpoint with a plausible regional build. Damage, enemies,
// clocks and health then run normally; all combat input uses keyboard events.
for (const stage of stages) {
  const profile = freshProfile(),
    run = createRun("PLAY-ENCOUNTERS", "needle", "spool");
  run.stage = stage;
  if (stage >= 7)
    run.upgrades = { double: 1, thread: 1, damage: 1, duration: 1 };
  if (stage >= 15)
    Object.assign(run.upgrades, { damage: 2, suture: 1, wide: 1, triangle: 1 });
  profile.run = run;
  profile.attempts = 2;
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: developmentOrigin,
          localStorage: [{ name: SAVE_KEY, value: JSON.stringify(profile) }],
        },
      ],
    },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(developmentURL);
  await page.locator('[data-action="continue"]').click();
  await page.bringToFront();
  await page.keyboard.down("KeyJ");
  const path = [
    ["KeyD", 1250],
    ["KeyW", 1600],
    ["KeyA", 2700],
    ["KeyS", 1550],
    ["KeyD", 2750],
  ];
  let lastKey = null;
  for (let tick = 0; tick < 180; tick++) {
    const snapshot = await page.evaluate(() => {
      const s = window.__ECHO_LOOM__.snapshot(),
        g = window.__ECHO_LOOM__.game();
      return {
        ...s,
        cords: g.hazards.filter((h) => h.kind === "cord").length,
        cuts: g.run.cordCuts,
        boss: g.boss
          ? {
              kind: g.boss.kind,
              hp: Math.ceil(g.boss.hp),
              state: g.boss.state,
              phase: g.boss.phase,
              attack: g.boss.plan?.name,
              timer: g.boss.timer,
              windup: g.boss.plan?.windup,
              phaseText: document.querySelector("#boss-phase")?.textContent,
              countdown: document.querySelector("#boss-countdown")?.textContent,
              telegraphHidden:
                document.querySelector("#boss-telegraph")?.hidden,
            }
          : null,
        machine: g.apparatus
          ? {
              kind: g.apparatus.kind,
              heat: g.apparatus.heat,
              lit: g.apparatus.objects.filter((n) => n.lit).length,
            }
          : null,
      };
    });
    if (snapshot.screen !== "play") {
      observations.push({
        stage,
        outcome: snapshot.screen,
        hp: snapshot.run.hp,
        time: snapshot.run.time,
        boss: snapshot.boss,
        machine: snapshot.machine,
        cuts: snapshot.cuts,
      });
      console.log(JSON.stringify(observations.at(-1)));
      break;
    }
    let ms =
        (tick * 250) % path.reduce((sum, [, duration]) => sum + duration, 0),
      key = path[0][0];
    for (const [candidate, duration] of path) {
      key = candidate;
      if (ms < duration) break;
      ms -= duration;
    }
    if (lastKey !== key) {
      if (lastKey) await page.keyboard.up(lastKey);
      await page.keyboard.down(key);
      lastKey = key;
    }
    if (tick % 21 === 3) await page.keyboard.press("KeyQ");
    if (tick % 21 === 16) await page.keyboard.press("KeyR");
    if (tick % 9 === 1) await page.keyboard.press("Space");
    if (
      tick === 30 ||
      (snapshot.cords &&
        !observations.some((o) => o.stage === stage && o.capture === "cord")) ||
      (snapshot.boss?.state === "windup" &&
        tick > 15 &&
        !observations.some(
          (o) =>
            o.stage === stage &&
            o.capture === (snapshot.boss.phase ? "second" : "windup"),
        ))
    ) {
      const capture =
        tick === 30
          ? "combat"
          : snapshot.cords
            ? "cord"
            : snapshot.boss?.phase
              ? "second"
              : "windup";
      await page.screenshot({
        path: `${artifact}/encounter-${prefix}${stage}-${capture}.png`,
      });
      observations.push({
        stage,
        capture,
        hp: snapshot.run.hp,
        time: snapshot.run.time,
        boss: snapshot.boss,
        machine: snapshot.machine,
        cuts: snapshot.cuts,
      });
    }
    await page.waitForTimeout(250);
  }
  if (lastKey) await page.keyboard.up(lastKey);
  await page.keyboard.up("KeyJ");
  if (!observations.some((o) => o.stage === stage && o.outcome)) {
    const final = await page.evaluate(() => {
      const g = window.__ECHO_LOOM__.game();
      return {
        mode: g.mode,
        hp: g.run.hp,
        time: g.run.time,
        kills: g.run.kills,
        enemies: g.enemies.length,
        bossHp: g.boss?.hp,
        lit: g.apparatus?.objects.filter((n) => n.lit).length,
      };
    });
    observations.push({ stage, outcome: "time-limit", ...final });
    await page.screenshot({
      path: `${artifact}/encounter-${prefix}${stage}-final.png`,
    });
    console.log(JSON.stringify(observations.at(-1)));
  }
  await context.close();
}
writeFileSync(
  `${artifact}/play-encounters${tag ? `-${tag}` : ""}${selected.length ? `-${selected.join("-")}` : ""}.json`,
  JSON.stringify({ errors, observations }, null, 2),
);
console.log(JSON.stringify({ errors, observations }, null, 2));
await browser.close();
