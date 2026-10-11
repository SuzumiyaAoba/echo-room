import { developmentURL } from "./browser-url.js";
import {
  observationDirectory,
  observationInputPath,
} from "./observation-files.js";
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { SIMULATION_STYLES } from "./simulate.js";
import {
  WEAPONS,
  RELICS,
  UPGRADES,
  CATALOG_VERSION,
  isCamp,
  isBoss,
} from "../src/content.js";
import {
  freshProfile,
  SAVE_KEY,
  exportProfile,
  prepareImport,
} from "../src/save.js";

const style = process.argv[2] || "weaving";
const seed = process.argv[3] || "EXPEDITION-ONE";
const repetitions = Number(process.argv[4] || 1);
const artifactName = process.argv[5] || style;
const weapon = process.argv[6] || "needle";
const relicIndex = process.argv.indexOf("--relic");
const relic = relicIndex < 0 ? "spool" : process.argv[relicIndex + 1];
if (!RELICS.some((r) => r.id === relic)) throw new Error("Unknown pilot relic");
const bellSource = relic === "bell" ? "return-offline-export.json" : null;
let bellUnlock = null;
const useRerolls = process.argv.includes("--reroll");
const useTraders = process.argv.includes("--trader");
const requireThreadGuard = process.argv.includes("--guard");
const requireCounter = process.argv.includes("--counter");
const requireMemoryWard = process.argv.includes("--ward");
const requireNeedleStitch = process.argv.includes("--stitch");
const requireRewind = process.argv.includes("--rewind");
const inspectLayouts = process.argv.includes("--layouts");
const inspectEncounters = process.argv.includes("--encounters");
const verifyReturn = process.argv.includes("--return-record");
// At a trader, pay for full recovery first and retain one reward reroll.
const traderReserve = 12;
const policy = SIMULATION_STYLES[style];
if (!policy) throw new Error("Unknown pilot style");
const priority = requireRewind
  ? ["rewind", ...policy.priority]
  : policy.priority;
function desiredFragments(run) {
  return priority
    .filter((id) => {
      const u = UPGRADES.find((item) => item.id === id);
      return (
        u &&
        (run.upgrades[id] || 0) < u.max &&
        (u.rarity !== "legendary" || run.stage >= 6) &&
        (!u.requires || run.upgrades[u.requires])
      );
    })
    .slice(0, 3);
}
if (!WEAPONS.some((w) => w.id === weapon))
  throw new Error("Unknown pilot weapon");
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 4)
  throw new Error("Expected one to four expeditions in the same page");
if (!/^[a-z0-9-]+$/.test(artifactName))
  throw new Error("Expected a plain artifact name");
const destination = observationDirectory;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options) {
        super({ ...options, sinkId: { type: "none" } });
      }
    };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (weapon !== "needle" && relic !== "bell") {
    const profile = freshProfile();
    profile.unlocked.push(weapon);
    await page.addInitScript(
      ({ key, value }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(value));
      },
      { key: SAVE_KEY, value: profile },
    );
  }
  await page.goto(developmentURL);
  if (relic === "bell") {
    const bytes = await readFile(await observationInputPath(bellSource));
    const earned = prepareImport(bytes.toString()).profile;
    assert.equal(earned.run, null);
    assert.equal(earned.unlocked.includes("bell"), false);
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.locator("#save-file").setInputFiles({
      name: "earned-return.json",
      mimeType: "application/json",
      buffer: bytes,
    });
    await page
      .getByRole("button", { name: "記録を取り込む", exact: true })
      .click();
    await page.getByRole("button", { name: "灯守の工房", exact: true }).click();
    await page.locator('[data-action="unlock"][data-id="bell"]').click();
    const unlocked = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      SAVE_KEY,
    );
    assert.equal(unlocked.memory, earned.memory - 25);
    assert.equal(unlocked.unlocked.includes("bell"), true);
    bellUnlock = {
      source: bellSource,
      sourceMemory: earned.memory,
      spent: 25,
      remainingMemory: unlocked.memory,
      sourceVictories: earned.victories,
      unlocked: unlocked.unlocked,
    };
    await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  }
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator(`[data-action="weapon"][data-id="${weapon}"]`).click();
  await page.locator('[data-action="relic"][data-id="' + relic + '"]').click();
  const cdp = await page.context().newCDPSession(page);
  const held = new Set(),
    reports = [],
    setupHeaps = [];
  async function heap() {
    await cdp.send("HeapProfiler.collectGarbage");
    return cdp.send("Runtime.getHeapUsage");
  }
  async function keys(wanted) {
    for (const key of [...held])
      if (!wanted.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of wanted)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
  }
  setupHeaps.push(await heap());
  const sessionStarted = Date.now();
  for (let expedition = 1; expedition <= repetitions; expedition++) {
    const currentSeed = expedition === 1 ? seed : `${seed}-${expedition}`;
    const departure = verifyReturn
      ? (await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)),
          SAVE_KEY,
        )) || freshProfile()
      : null;
    await page.locator("#seed").fill(currentSeed);
    await page.getByRole("button", { name: "この灯りで出発する" }).click();
    if (relic === "bell")
      await page.evaluate(() => {
        const prototype = window.__ECHO_LOOM__.game().constructor.prototype;
        window.__bellOriginal ||= prototype.dash;
        const original = window.__bellOriginal;
        window.__bellCalls = [];
        prototype.dash = function (...args) {
          const origin = { x: this.player.x, y: this.player.y };
          const before = this.bullets.slice();
          const cd = this.player.echoCd;
          const charges = this.player.echoCharges;
          const expected = before.filter(
            (b) =>
              !b.friendly && Math.hypot(b.x - origin.x, b.y - origin.y) <= 38,
          );
          const expectedRecovery =
            charges < this.stats.echoes && cd > 0
              ? Math.min(cd, expected.length * 0.3, 0.9)
              : 0;
          const result = Reflect.apply(original, this, args);
          window.__bellCalls.push({
            stage: this.run.stage,
            time: this.run.time,
            origin,
            erased: expected.length,
            recovered: cd - this.player.echoCd,
            expectedRecovery,
            charges,
            cooldownBefore: cd,
            cooldownAfter: this.player.echoCd,
            erasureExact: before.every(
              (b) => this.bullets.includes(b) === !expected.includes(b),
            ),
            recoveryExact:
              Math.abs(cd - this.player.echoCd - expectedRecovery) < 1e-10,
            pulse: structuredClone(this.bellPulse),
          });
          return result;
        };
      });
    if (requireRewind)
      await page.evaluate(() => {
        const prototype = window.__ECHO_LOOM__.game().constructor.prototype;
        window.__rewindOriginal ||= prototype.castEcho;
        const original = window.__rewindOriginal;
        window.__rewindCasts = [];
        prototype.castEcho = function (...args) {
          const active = this.run.upgrades.rewind > 0;
          const recorded = active ? structuredClone(this.history) : null;
          const result = Reflect.apply(original, this, args);
          if (active) {
            const echo = this.echoes.at(-1);
            const expected = recorded.slice().reverse();
            window.__rewindCasts.push({
              stage: this.run.stage,
              gameSeconds: this.run.time,
              exact: JSON.stringify(echo.frames) === JSON.stringify(expected),
              historyUnchanged:
                JSON.stringify(this.history) === JSON.stringify(recorded),
              playback: echo.playback,
              frames: echo.frames.length,
              origin: { x: echo.x, y: echo.y },
              end: { x: echo.frames.at(-1).x, y: echo.frames.at(-1).y },
              shots: echo.frames.filter((f) => f.fire).length,
              ...(window.__rewindCasts.length < 3
                ? { actual: structuredClone(echo.frames), recorded }
                : {}),
            });
          }
          return result;
        };
      });
    const help = page.getByRole("button", { name: "最初のひと針へ" });
    if (await help.count()) await help.click();
    await page.bringToFront();
    const beforeHeap = await heap(),
      samples = [],
      stages = [],
      choices = [],
      rerolls = [],
      trades = [],
      campChoices = [],
      forecasts = [],
      stolen = [],
      memoryWard = [],
      encounterEntries = [],
      commands = { echo: 0, dash: 0, release: 0 };
    const started = Date.now();
    let counterCheckpoint = null;
    let memoryWardCheckpoint = null;
    let layoutCheckpoint = null;
    let rewindCheckpoint = null;
    async function captureMemoryWardCheckpoint() {
      if (!requireMemoryWard || memoryWardCheckpoint) return;
      const actualProfile = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        SAVE_KEY,
      );
      assert.equal(actualProfile.run.stage, 23);
      assert.equal(actualProfile.run.checkpoint, "entry");
      const artifact = `memory-ward-arrival-${artifactName}.json`;
      await writeFile(
        `${destination}/${artifact}`,
        exportProfile(actualProfile) + "\n",
      );
      memoryWardCheckpoint = {
        artifact,
        stage: actualProfile.run.stage,
        checkpoint: actualProfile.run.checkpoint,
        hp: actualProfile.run.hp,
        gameSeconds: actualProfile.run.time,
      };
      console.log(
        JSON.stringify({
          event: "memory-ward-earned",
          ...memoryWardCheckpoint,
        }),
      );
    }
    async function captureCounterCheckpoint() {
      if (!requireCounter || counterCheckpoint) return;
      const actualProfile = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        SAVE_KEY,
      );
      if (!actualProfile.run?.upgrades.counter) return;
      // Keep an earned checkpoint whose next room is ordinary combat, so the
      // production check can use the same backup without changing its stage.
      if (
        isCamp(actualProfile.run.stage + 1) ||
        isBoss(actualProfile.run.stage + 1)
      )
        return;
      assert.ok(["cleared", "shop"].includes(actualProfile.run.checkpoint));
      const artifact = `counter-earned-${artifactName}.json`;
      await writeFile(
        `${destination}/${artifact}`,
        exportProfile(actualProfile) + "\n",
      );
      counterCheckpoint = {
        artifact,
        stage: actualProfile.run.stage,
        checkpoint: actualProfile.run.checkpoint,
        hp: actualProfile.run.hp,
        threadCuts: actualProfile.run.threadCuts,
        threadReturns: actualProfile.run.threadReturns,
      };
      console.log(
        JSON.stringify({ event: "counter-earned", ...counterCheckpoint }),
      );
    }
    let lastLog = 0,
      previousStage = -1,
      outcome = "time-limit",
      final,
      clearedSince = 0;
    while (Date.now() - started < 15 * 60 * 1000) {
      const snapshot = await page.evaluate(
        async ({ releaseAfter, footwork }) => {
          const d = window.__ECHO_LOOM__,
            g = d.game(),
            p = g.player;
          const { hazardDanger, canReleaseCounter } = await import(
            "/scripts/pilot-hazards.js"
          );
          const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
          const segment = (p, a, b) => {
            const dx = b.x - a.x,
              dy = b.y - a.y;
            const t = Math.max(
              0,
              Math.min(
                1,
                ((p.x - a.x) * dx + (p.y - a.y) * dy) /
                  (dx * dx + dy * dy || 1),
              ),
            );
            return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
          };
          const target =
            g.mode === "cleared"
              ? { x: 240, y: 43 }
              : {
                  x: 240 + Math.cos(g.roomTime * 0.6) * 152,
                  y: 156 + Math.sin(g.roomTime * 0.6) * 91,
                };
          let mx = target.x - p.x,
            my = target.y - p.y;
          if (g.mode === "combat")
            for (const e of g.enemies)
              if (distance(e, p) < e.r + 32) {
                mx += (p.x - e.x) * 4;
                my += (p.y - e.y) * 4;
              }
          let angle = Math.atan2(my, mx);
          if (
            g.solid(p.x + Math.cos(angle) * 12, p.y + Math.sin(angle) * 12, p.r)
          )
            angle += 1.1;
          const exit =
            g.mode === "cleared"
              ? (await import("/scripts/pilot-navigation.js")).steerToExit(g)
              : null;
          const danger =
            g.bullets.some(
              (b) =>
                !b.friendly &&
                segment(p, b, { x: b.x + b.vx * 0.25, y: b.y + b.vy * 0.25 }) <
                  14,
            ) ||
            g.enemies.some((e) => distance(e, p) < e.r + 13) ||
            g.hazards.some((h) => hazardDanger(h, p));
          return {
            ...d.snapshot(),
            x: p.x,
            y: p.y,
            mx: exit?.mx ?? Math.cos(angle),
            my: exit?.my ?? Math.sin(angle),
            canEcho: p.echoCharges > 0 && g.history.length >= 24,
            canDash:
              p.dashCd === 0 &&
              (danger ||
                (footwork &&
                  g.run.upgrades.dashthread &&
                  g.enemies.some((e) =>
                    g
                      .threads()
                      .some(
                        ([a, b]) =>
                          distance(a, b) > 10 &&
                          segment(e, a, b) < e.r + g.stats.threadWidth,
                      ),
                  ))),
            canRelease: g.echoes.some(
              (e) =>
                e.elapsed > releaseAfter &&
                (g.enemies.some(
                  (n) => distance(e, n) < g.stats.burstRadius + n.r,
                ) ||
                  canReleaseCounter(g, e)),
            ),
            atDoor: distance(p, { x: 240, y: 43 }) < 27,
            plannedEnemies:
              g.enemies.length + g.spawnQueue.length + g.roomKills,
            audio: {
              time: d.audio().ctx?.currentTime,
              voices: d.audio().voices.size,
              track: d.audio().scene.track,
            },
            stolen: g.hazards
              .filter((h) => h.kind === "stolenEcho")
              .map((h) => ({
                phase: h.age < h.warning ? "warning" : "active",
                age: h.age,
                frames: h.frames.length,
                hit: h.hit,
              })),
            ward: (() => {
              const row = document.querySelector("#boss-ward");
              if (
                !row ||
                row.hidden ||
                document.querySelector("#bossbar").hidden
              )
                return null;
              return {
                state: row.dataset.state,
                text: document.querySelector("#boss-ward-state").textContent,
                intent: document.querySelector("#boss-intent").textContent,
                telegraphVisible:
                  !document.querySelector("#boss-telegraph").hidden,
              };
            })(),
            counts: {
              enemies: g.enemies.length,
              bullets: g.bullets.length,
              particles: g.particles.length,
              echoes: g.echoes.length,
              stolenEchoes: g.hazards.filter((h) => h.kind === "stolenEcho")
                .length,
              fragments: g.bullets.filter((b) => b.fragment).length,
            },
          };
        },
        { releaseAfter: policy.releaseAfter, footwork: style === "footwork" },
      );
      final = snapshot;
      if (
        requireMemoryWard &&
        snapshot.ward &&
        memoryWard.at(-1)?.state !== snapshot.ward.state
      ) {
        const observed = {
          stage: snapshot.run.stage,
          gameSeconds: snapshot.run.time,
          ...snapshot.ward,
        };
        memoryWard.push(observed);
        console.log(JSON.stringify({ event: "memory-ward", ...observed }));
        if (
          ["closed", "open"].includes(observed.state) &&
          memoryWard.filter((w) => w.state === observed.state).length === 1
        )
          await page.screenshot({
            path: `${destination}/memory-ward-expedition-${artifactName}-${observed.state}.png`,
          });
      }
      for (const h of snapshot.stolen) {
        if (
          !stolen.some(
            (n) => n.stage === snapshot.run.stage && n.phase === h.phase,
          )
        ) {
          const observed = {
            stage: snapshot.run.stage,
            gameSeconds: snapshot.run.time,
            ...h,
          };
          stolen.push(observed);
          console.log(
            JSON.stringify({ event: "stolen", expedition, ...observed }),
          );
        }
      }
      if (snapshot.run.stage !== previousStage) {
        if (
          requireRewind &&
          !rewindCheckpoint &&
          snapshot.run.upgrades.rewind &&
          !isCamp(snapshot.run.stage)
        ) {
          const earned = await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)),
            SAVE_KEY,
          );
          assert.equal(earned.run.checkpoint, "entry");
          assert.equal(earned.run.upgrades.rewind, 1);
          const artifact = `rewind-earned-${artifactName}.json`;
          await writeFile(
            `${destination}/${artifact}`,
            exportProfile(earned) + "\n",
          );
          rewindCheckpoint = {
            artifact,
            stage: earned.run.stage,
            hp: earned.run.hp,
            gameSeconds: earned.run.time,
          };
          console.log(
            JSON.stringify({ event: "rewind-earned", ...rewindCheckpoint }),
          );
        }
        if (inspectEncounters && [1, 9, 17].includes(snapshot.run.stage)) {
          const actualProfile = await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)),
            SAVE_KEY,
          );
          assert.equal(actualProfile.run.encounterVersion, 1);
          assert.equal(actualProfile.run.checkpoint, "entry");
          const artifact = `encounter-entry-${artifactName}-${snapshot.run.stage}.json`;
          await writeFile(
            `${destination}/${artifact}`,
            exportProfile(actualProfile) + "\n",
          );
          const encounter = await page.evaluate(() =>
            structuredClone(window.__ECHO_LOOM__.game().encounter),
          );
          encounterEntries.push({
            artifact,
            stage: snapshot.run.stage,
            encounter,
            hp: actualProfile.run.hp,
          });
          console.log(
            JSON.stringify({
              event: "encounter-earned",
              ...encounterEntries.at(-1),
            }),
          );
        }
        if (snapshot.run.stage === 23) await captureMemoryWardCheckpoint();
        const layout = inspectLayouts
          ? await page.evaluate(() => {
              const g = window.__ECHO_LOOM__.game();
              return {
                version: g.run.layoutVersion,
                id: g.layout.id || null,
                name: g.layout.name,
                tiles: structuredClone(g.tiles),
              };
            })
          : null;
        if (inspectLayouts && snapshot.run.stage === 8) {
          const actualProfile = await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)),
            SAVE_KEY,
          );
          assert.equal(actualProfile.run.layoutVersion, 2);
          assert.equal(actualProfile.run.stage, 8);
          assert.equal(actualProfile.run.checkpoint, "entry");
          const artifact = `layouts-earned-${artifactName}.json`;
          await writeFile(
            `${destination}/${artifact}`,
            exportProfile(actualProfile) + "\n",
          );
          layoutCheckpoint = {
            artifact,
            stage: 8,
            checkpoint: "entry",
            hp: actualProfile.run.hp,
            gameSeconds: actualProfile.run.time,
            layout,
          };
          console.log(
            JSON.stringify({ event: "layouts-earned", ...layoutCheckpoint }),
          );
        }
        const forecast = forecasts.find((f) => f.stage === snapshot.run.stage);
        if (forecast?.total !== null && forecast)
          assert.equal(
            snapshot.plannedEnemies,
            forecast.total,
            "Enter the advertised encounter",
          );
        stages.push({
          stage: snapshot.run.stage,
          mode: snapshot.mode,
          position: { x: snapshot.x, y: snapshot.y },
          hp: snapshot.run.hp,
          runSeconds: snapshot.run.time,
          ...(inspectLayouts ? { layout } : {}),
        });
        previousStage = snapshot.run.stage;
        console.log(
          JSON.stringify({ event: "enter", expedition, ...stages.at(-1) }),
        );
      }
      if (snapshot.mode === "cleared" && snapshot.screen === "play") {
        clearedSince ||= Date.now();
        if (Date.now() - clearedSince > 30000) {
          outcome = "blocked-exit";
          break;
        }
      } else clearedSince = 0;
      if (Date.now() - lastLog > 30000) {
        lastLog = Date.now();
        const sample = {
          wallSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
          stage: snapshot.run.stage,
          hp: Math.ceil(snapshot.run.hp),
          gameSeconds: Number(snapshot.run.time.toFixed(1)),
          audio: snapshot.audio,
          counts: snapshot.counts,
        };
        samples.push(sample);
        console.log(JSON.stringify({ event: "sample", expedition, ...sample }));
      }
      if (["victory", "defeat"].includes(snapshot.screen)) {
        outcome = snapshot.screen;
        break;
      }
      if (snapshot.screen !== "play") {
        await keys([]);
        if (snapshot.screen === "reward") {
          let ids = await page
            .locator('[data-action="upgrade"]')
            .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
          if (useRerolls) {
            const desired = desiredFragments(snapshot.run);
            for (
              let attempt = 0;
              desired.length &&
              attempt < 2 &&
              !ids.some((id) => desired.includes(id));
              attempt++
            ) {
              const button = page.locator('[data-action="rerollreward"]');
              if (!(await button.count()) || !(await button.isEnabled())) break;
              const before = await page.evaluate(
                () => window.__ECHO_LOOM__.snapshot().run,
              );
              const cost = 12 + before.rewardRoll * 8;
              if (before.scrap < cost + 20) break; // Leave the trader's heal cost.
              const previous = [...ids];
              await button.click();
              ids = await page
                .locator('[data-action="upgrade"]')
                .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
              const after = await page.evaluate(
                () => window.__ECHO_LOOM__.snapshot().run,
              );
              assert.equal(after.scrap, before.scrap - cost);
              assert.equal(after.rewardRoll, before.rewardRoll + 1);
              const choice = {
                stage: after.stage,
                cost,
                scrapBefore: before.scrap,
                scrapAfter: after.scrap,
                roll: after.rewardRoll,
                before: previous,
                after: [...ids],
                desired,
              };
              rerolls.push(choice);
              console.log(JSON.stringify({ event: "reroll", ...choice }));
            }
          }
          const forecast = forecasts.find(
            (f) => f.stage === snapshot.run.stage,
          );
          if (forecast?.promised) {
            assert.ok(
              ids.includes(forecast.promised),
              "Award the advertised fragment after real combat",
            );
            forecast.rewardIds = [...ids];
            forecast.promiseKept = true;
          }
          ids.sort(
            (a, b) =>
              (priority.indexOf(a) < 0 ? 99 : priority.indexOf(a)) -
              (priority.indexOf(b) < 0 ? 99 : priority.indexOf(b)),
          );
          choices.push({ stage: snapshot.run.stage, id: ids[0], offered: ids });
          await page
            .locator(`[data-action="upgrade"][data-id="${ids[0]}"]`)
            .click();
          await captureCounterCheckpoint();
        } else if (snapshot.screen === "route") {
          const next = snapshot.run.stage + 1;
          let route = [2, 5].includes(next % 8) ? "rest" : "loom";
          if (inspectEncounters && next % 8 === 4) route = "salvage";
          if (useTraders && route === "rest") {
            const stock = await page
              .locator(
                '[data-action="route"][data-id="salvage"] .route-stock-item',
              )
              .evaluateAll((nodes) =>
                nodes.map((node) => ({
                  id: node.dataset.id,
                  price: Number(
                    node.querySelector("small").textContent.match(/\d+/)[0],
                  ),
                })),
              );
            const desired = desiredFragments({ ...snapshot.run, stage: next });
            const healBudget =
              Math.ceil((snapshot.run.maxHp - snapshot.run.hp) / 30) * 20;
            if (
              stock.some(
                (u) =>
                  desired.includes(u.id) &&
                  snapshot.run.scrap >= u.price + healBudget + traderReserve,
              )
            )
              route = "salvage";
            campChoices.push({
              stage: next,
              route,
              stock,
              desired,
              healBudget,
              reserve: traderReserve,
              scrap: snapshot.run.scrap,
              hp: snapshot.run.hp,
            });
          }
          const card = page.locator(
            `[data-action="route"][data-id="${route}"]`,
          );
          forecasts.push(
            await card.evaluate(
              (node, stage) => ({
                stage,
                route: node.dataset.id,
                promised: node.dataset.promised || null,
                name: node.querySelector("h3").textContent,
                total: node.querySelector(
                  ".route-encounter strong:last-of-type",
                )
                  ? Number(
                      node
                        .querySelector(".route-encounter strong:last-of-type")
                        .textContent.match(/敵\s+(\d+)体/)[1],
                    )
                  : null,
                encounter: node.querySelector("[data-encounter-id]")
                  ? {
                      id: node.querySelector("[data-encounter-id]").dataset
                        .encounterId,
                      name: node.querySelector(".route-tactic").textContent,
                    }
                  : null,
                traderStock: node.dataset.stock
                  ? node.dataset.stock.split(",")
                  : null,
              }),
              next,
            ),
          );
          if (inspectEncounters && [4, 12, 20].includes(next)) {
            await page.screenshot({
              path: `${destination}/routes-earned-${artifactName}-${next}.png`,
            });
          }
          await card.click();
        } else if (snapshot.screen === "shop") {
          if (!trades.length) {
            const actualProfile = await page.evaluate(
              (key) => JSON.parse(localStorage.getItem(key)),
              SAVE_KEY,
            );
            await writeFile(
              `${destination}/trader-arrival-${artifactName}.json`,
              exportProfile(actualProfile) + "\n",
            );
          }
          const forecast = forecasts.find(
            (f) => f.stage === snapshot.run.stage,
          );
          const actualStock = await page
            .locator('[data-action="buy"]')
            .evaluateAll((nodes) => nodes.map((node) => node.dataset.id));
          assert.deepEqual(
            actualStock,
            forecast.traderStock,
            "Enter the advertised trader inventory",
          );
          while (await page.locator('[data-action="buyheal"]').isEnabled()) {
            const before = await page.evaluate(
              () => window.__ECHO_LOOM__.snapshot().run,
            );
            await page.locator('[data-action="buyheal"]').click();
            const after = await page.evaluate(
              () => window.__ECHO_LOOM__.snapshot().run,
            );
            assert.equal(after.scrap, before.scrap - 20);
            assert.equal(after.hp, Math.min(before.maxHp, before.hp + 30));
            trades.push({
              stage: after.stage,
              type: "heal",
              cost: 20,
              scrapBefore: before.scrap,
              scrapAfter: after.scrap,
              hpBefore: before.hp,
              hpAfter: after.hp,
            });
          }
          for (let attempt = 0; attempt < 3; attempt++) {
            const before = await page.evaluate(
              () => window.__ECHO_LOOM__.snapshot().run,
            );
            const desired = desiredFragments(before);
            const available = await page
              .locator('[data-action="buy"]:enabled')
              .evaluateAll((nodes) =>
                nodes.map((node) => ({
                  id: node.dataset.id,
                  price: Number(
                    node.querySelector(".detail").textContent.match(/\d+/)[0],
                  ),
                })),
              );
            const item = available
              .filter(
                (u) =>
                  desired.includes(u.id) &&
                  before.scrap >= u.price + traderReserve,
              )
              .sort(
                (a, b) => priority.indexOf(a.id) - priority.indexOf(b.id),
              )[0];
            if (!item) break;
            await page
              .locator(`[data-action="buy"][data-id="${item.id}"]`)
              .click();
            const after = await page.evaluate(
              () => window.__ECHO_LOOM__.snapshot().run,
            );
            assert.equal(after.scrap, before.scrap - item.price);
            assert.equal(
              after.upgrades[item.id],
              (before.upgrades[item.id] || 0) + 1,
            );
            const purchase = {
              stage: after.stage,
              type: "fragment",
              id: item.id,
              cost: item.price,
              scrapBefore: before.scrap,
              scrapAfter: after.scrap,
              rank: after.upgrades[item.id],
              stock: actualStock,
            };
            trades.push(purchase);
            console.log(JSON.stringify({ event: "trade", ...purchase }));
            await captureCounterCheckpoint();
          }
          assert.deepEqual(
            await page
              .locator('[data-action="buy"]')
              .evaluateAll((nodes) => nodes.map((node) => node.dataset.id)),
            forecast.traderStock,
            "Purchases retain the advertised trader inventory",
          );
          forecast.traderStockKept = true;
          await page.locator('[data-action="campdone"]').click();
        } else if (snapshot.screen === "camp")
          await page.locator('[data-action="campdone"]').click();
        else if (snapshot.screen === "pause")
          await page
            .getByRole("button", { name: "航路へ戻る", exact: true })
            .click();
        else
          throw new Error(`Unexpected expedition screen: ${snapshot.screen}`);
        continue;
      }
      const wanted = [];
      if (snapshot.mx > 0.25) wanted.push("KeyD");
      if (snapshot.mx < -0.25) wanted.push("KeyA");
      if (snapshot.my > 0.25) wanted.push("KeyS");
      if (snapshot.my < -0.25) wanted.push("KeyW");
      if (snapshot.mode === "combat") wanted.push("KeyJ");
      await keys(wanted);
      if (snapshot.mode === "cleared" && snapshot.atDoor)
        await page.keyboard.press("KeyE");
      else if (snapshot.mode === "combat") {
        if (snapshot.canEcho) {
          await page.keyboard.press("KeyQ");
          commands.echo++;
        }
        if (snapshot.canDash) {
          await page.keyboard.press("Space");
          commands.dash++;
        }
        if (snapshot.canRelease) {
          await page.keyboard.press("KeyR");
          commands.release++;
        }
      }
      await page.waitForTimeout(125);
    }
    await keys([]);
    const artifact = `expedition-${artifactName}${repetitions > 1 ? `-${expedition}` : ""}`;
    await page.screenshot({
      path: `${destination}/${artifact}-${outcome}.png`,
    });
    const afterHeap = await heap();
    const report = {
      environment: `Native headless Chromium keyboard pilot, ${relic === "bell" ? "fresh journey after importing a genuine previous victory export and paying 25 memory to unlock the bell in the workshop" : weapon === "needle" ? "fresh profile" : "fresh journey with a pre-unlocked weapon profile fixture"}, ${weapon}/${relic} selected through the native setup UI; subsequent expeditions through the actual replay UI in the same page; actual three-card rewards and ${useTraders ? "forecast-based trader decisions and paid recovery, otherwise full rest" : "full rest at camps"}, no combat/health/clock mutations; native silent audio output. Not a human enjoyment evaluation. Heap figures cover JavaScript after forced GC, not total browser/native audio memory.`,
      ...(inspectEncounters ? { encounterEntries } : {}),
      weapon,
      relic,
      preUnlockedFixture: weapon !== "needle" && relic !== "bell",
      ...(relic === "bell"
        ? {
            bellUnlock,
            bellCalls: await page.evaluate(() => window.__bellCalls),
          }
        : {}),
      seed: currentSeed,
      style,
      expedition,
      outcome,
      wallSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      run: final.run,
      stages,
      choices,
      counterCheckpoint,
      memoryWardCheckpoint,
      ...(requireRewind
        ? {
            rewindCheckpoint,
            rewindCasts: await page.evaluate(() => window.__rewindCasts),
            rewindPolicy:
              "Prioritize the offered or paid rewind fragment, then use the original style priorities. Cast observer invokes the original once and only reads history/frames; no actor, health, enemy or clock mutation.",
          }
        : {}),
      ...(inspectLayouts ? { layoutCheckpoint } : {}),
      memoryWard,
      rerolls,
      trades,
      threadGuardVerification: requireThreadGuard
        ? "Observe hostile bullets unraveled by the actual separated threads during ordinary native keyboard combat; no injected projectiles or adjusted battle state."
        : null,
      counterVerification: requireCounter
        ? "Acquire the counter fragment through an offered reward or a paid trader; store actual incoming bullets on the recorded echoes and launch returned needles by native release input. No injected projectiles or battle-state changes."
        : null,
      campChoices,
      traderPolicy: useTraders
        ? "Choose the trader when its advertised inventory has a top-three still-eligible build fragment, with enough scrap to heal fully and retain one reroll fee (12); otherwise rest. Buy needed recovery and desired available fragments through public buttons."
        : null,
      rerollPolicy: useRerolls
        ? "Seek one of the top three still-eligible build fragments, at most two public button clicks per room, retain 20 scrap for a trader heal."
        : null,
      forecasts,
      stolen,
      commands,
      samples,
      beforeHeap,
      afterHeap,
      errors,
    };
    await writeFile(
      `${destination}/${artifact}.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        event: "finished",
        expedition,
        outcome,
        stage: final.run.stage,
        hp: Math.ceil(final.run.hp),
        gameSeconds: Math.round(final.run.time),
        wallSeconds: report.wallSeconds,
        beforeHeap: beforeHeap.usedSize,
        afterHeap: afterHeap.usedSize,
        errors,
      }),
    );
    reports.push(report);
    assert.deepEqual(errors, [], "No uncaught page exceptions");
    assert.equal(outcome, "victory", "Pilot must finish every expedition");
    assert.equal(stages.length, 24, "Visit every room through native input");
    if (requireRewind) {
      assert.equal(final.run.catalogVersion, CATALOG_VERSION);
      assert.equal(final.run.upgrades.rewind, 1);
      assert.ok(rewindCheckpoint);
      assert.ok(report.rewindCasts.length > 0);
      assert.ok(
        report.rewindCasts.every(
          (x) => x.exact && x.historyUnchanged && x.playback === "reverse",
        ),
      );
    }
    if (requireNeedleStitch)
      assert.ok(
        final.run.needleStitches > 0,
        "Complete actual needle stitches through native shooting and echoes",
      );
    if (requireMemoryWard) {
      assert.ok(
        memoryWardCheckpoint,
        "Capture the actual final-room entry after reaching it through native input",
      );
      assert.ok(
        memoryWard.some((w) => w.state === "open"),
        "Open the memory ward during actual native combat",
      );
    }
    if (requireThreadGuard)
      assert.ok(
        final.run.threadCuts > 0,
        "Unravel actual hostile bullets with the thread during the expedition",
      );
    if (requireCounter) {
      assert.ok(
        counterCheckpoint,
        "Capture an unchanged earned counter checkpoint before ordinary combat",
      );
      assert.equal(final.run.catalogVersion, CATALOG_VERSION);
      assert.equal(final.run.upgrades.counter, 1);
      assert.ok(
        final.run.threadReturns > 0,
        "Return actual stored hostile light during native combat",
      );
      assert.ok(
        choices.some((choice) => choice.id === "counter") ||
          trades.some((trade) => trade.id === "counter"),
        "Acquire the new fragment through an actual public choice or paid purchase",
      );
    }
    assert.ok(
      forecasts.filter((f) => f.promised).length > 0,
      "Choose at least one advertised fragment",
    );
    assert.ok(
      forecasts.filter((f) => f.promised).every((f) => f.promiseKept),
      "Every advertised fragment is awarded",
    );
    if (useTraders) {
      assert.ok(
        trades.some((t) => t.type === "fragment"),
        "Use earned scrap to buy a fragment at the trader",
      );
      assert.ok(
        forecasts.filter((f) => f.traderStock).every((f) => f.traderStockKept),
        "Every selected trader retains its advertised stock",
      );
    }
    assert.ok(
      samples.every(
        (sample, i) =>
          Number.isFinite(sample.audio.time) &&
          (i === 0 || sample.audio.time > samples[i - 1].audio.time),
      ),
      "Native audio clock must advance throughout the expedition",
    );
    if (verifyReturn) {
      const { inspectExpeditionReturn } = await import(
        "./expedition-return.js"
      );
      report.returnVerification = await inspectExpeditionReturn({
        page,
        run: final.run,
        departure,
        destination,
        artifact,
      });
      await writeFile(
        `${destination}/${artifact}.json`,
        JSON.stringify(report, null, 2) + "\n",
      );
      console.log(
        JSON.stringify({
          event: "return-verified",
          ...report.returnVerification,
        }),
      );
    } else await page.locator('[data-action="again"]').click();
    await page.waitForTimeout(1200);
    assert.equal(
      await page.evaluate(() => window.__ECHO_LOOM__.game()),
      null,
      "Replay setup must retire the completed game",
    );
    setupHeaps.push(await heap());
  }
  if (repetitions > 1) {
    const lifecycle = {
      environment: reports[0].environment,
      style,
      repetitions,
      wallSeconds: Number(((Date.now() - sessionStarted) / 1000).toFixed(1)),
      outcomes: reports.map((report) => ({
        seed: report.seed,
        outcome: report.outcome,
        gameSeconds: report.run.time,
        wallSeconds: report.wallSeconds,
        hp: report.run.hp,
        kills: report.run.kills,
        casts: report.run.echoesCast,
        commands: report.commands,
        damageTaken: report.run.damageTaken,
        beforeHeap: report.beforeHeap.usedSize,
        afterHeap: report.afterHeap.usedSize,
      })),
      setupHeaps,
      maximumSampledVoices: Math.max(
        ...reports.flatMap((report) =>
          report.samples.map((sample) => sample.audio.voices),
        ),
      ),
      errors,
    };
    await writeFile(
      `${destination}/expedition-${artifactName}-lifecycle.json`,
      JSON.stringify(lifecycle, null, 2) + "\n",
    );
    console.log(JSON.stringify({ event: "lifecycle", ...lifecycle }));
  }
} finally {
  await browser.close();
}
