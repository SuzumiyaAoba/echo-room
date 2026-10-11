import { developmentURL } from "./browser-url.js";
import {
  observationDirectory,
  observationInputPath,
} from "./observation-files.js";
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createRun } from "../src/game.js";
import { UPGRADES } from "../src/content.js";
import { freshProfile, SAVE_KEY } from "../src/save.js";

const destination = observationDirectory;
const sources = Object.fromEntries(
  await Promise.all(
    ["before", "prototype"].map(async (variant) => [
      variant,
      await readFile(
        await observationInputPath(`renderer-presentation-${variant}.js`),
        "utf8",
      ),
    ]),
  ),
);
const profile = freshProfile();
profile.run = createRun("SYNTHETIC-RENDER-STRESS");
profile.run.stage = 20;
profile.run.upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
profile.attempts = 2;
const report = {
  scope:
    "One native headless Chromium browser and page, CPU slowdown four. Before/direct/direct/before navigation blocks, same synthetic initial scene and normal game loop, 120 warm-up and 240 measured frames per block. Artificial health/lifetime/load and silent audio sink. Browser display cadence, not a physical device or normal combat/balance benchmark. Different frame intervals change simulation trajectories; this is not an exact-state paired comparison.",
  order: ["before", "prototype", "prototype", "before"],
  blocks: [],
};
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ profile, key }) => {
      localStorage.setItem(key, JSON.stringify(profile));
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = class extends NativeAudioContext {
        constructor(options) {
          super({ ...options, sinkId: { type: "none" } });
        }
      };
    },
    { profile, key: SAVE_KEY },
  );
  let variant = "before";
  await page.route("**/src/render.js*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: sources[variant] }),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (const [block, current] of report.order.entries()) {
    variant = current;
    await page.goto(developmentURL);
    await page.locator('[data-action="continue"]').click();
    await page.bringToFront();
    await page.evaluate(() => {
      const g = window.__ECHO_LOOM__.game();
      g.spawnQueue = [];
      g.enemies = [];
      g.player.invulnerable = 10000;
      const kinds = [
        "crawler",
        "shooter",
        "charger",
        "shield",
        "moth",
        "weaver",
      ];
      for (let i = 0; i < 60; i++) {
        let x = 60 + (i % 10) * 36,
          y = 60 + Math.floor(i / 10) * 32;
        if (g.solid(x, y, 10)) {
          x = 240;
          y = 156;
        }
        const e = g.spawn(kinds[i % kinds.length], x, y);
        e.hp = e.maxHp = 1000000;
      }
      g.echoes = [0, 1, 2].map((index) => {
        const frames = Array.from({ length: 216 }, (_, i) => ({
          x: 240 + Math.cos(i / 120 + index * 2) * 140,
          y: 156 + Math.sin(i / 120 + index * 2) * 80,
          angle: i / 80,
          fire: i % 12 === 0,
          walk: i / 12,
          moving: true,
        }));
        return {
          x: frames[0].x,
          y: frames[0].y,
          r: 5,
          angle: 0,
          frames,
          frame: -1,
          elapsed: 0,
        };
      });
      window.__stressRefill = () => {
        for (const echo of g.echoes)
          if (echo.elapsed > 2.5) {
            echo.elapsed = 0;
            echo.frame = -1;
          }
        for (let i = g.bullets.length; i < 600; i++) {
          const a = i * 2.399;
          g.makeBullet(
            { x: 240 + Math.cos(a) * 140, y: 156 + Math.sin(a) * 80 },
            a + Math.PI,
            1,
            42,
            false,
            "#eca886",
          );
        }
      };
      window.__stressRefill();
    });
    await page.keyboard.down("KeyJ");
    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const warmup = [],
            times = [],
            peaks = {
              enemies: 0,
              bullets: 0,
              particles: 0,
              echoes: 0,
              voices: 0,
              storedLights: 0,
            };
          let previous = 0,
            lastRefill = 0,
            started = 0;
          const sample = (now) => {
            const g = window.__ECHO_LOOM__.game();
            if (now - lastRefill > 500) {
              window.__stressRefill();
              lastRefill = now;
            }
            if (previous) {
              const dt = now - previous;
              if (warmup.length < 120) {
                warmup.push(dt);
                started = g.run.time;
              } else times.push(dt);
            }
            previous = now;
            for (const key of ["enemies", "bullets", "particles", "echoes"])
              peaks[key] = Math.max(peaks[key], g[key].length);
            peaks.voices = Math.max(
              peaks.voices,
              window.__ECHO_LOOM__.audio().voices.size,
            );
            peaks.storedLights = Math.max(
              peaks.storedLights,
              g.echoes.reduce((n, e) => n + (e.returnStock || 0), 0),
            );
            if (times.length < 240) requestAnimationFrame(sample);
            else {
              const sorted = [...times].sort((a, b) => a - b);
              const c = document.querySelector("#world"),
                rect = c.getBoundingClientRect();
              resolve({
                warmupFrames: warmup.length,
                warmupMaxMs: Math.max(...warmup),
                frames: times.length,
                medianMs: sorted[120],
                p95Ms: sorted[228],
                maxMs: sorted.at(-1),
                slowFrames: times.filter((t) => t > 33.4).length,
                wallSeconds: times.reduce((n, t) => n + t, 0) / 1000,
                engineSeconds: g.run.time - started,
                audioSeconds: window.__ECHO_LOOM__.audio().ctx?.currentTime,
                peaks,
                canvas: {
                  width: c.width,
                  height: c.height,
                  cssWidth: rect.width,
                  cssHeight: rect.height,
                },
                times,
              });
            }
          };
          requestAnimationFrame(sample);
        }),
    );
    await page.keyboard.up("KeyJ");
    report.blocks.push({ block, variant, ...result });
    report.errors = [...errors];
    await writeFile(
      `${destination}/canvas-presentation-cadence.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    const { times, ...summary } = result;
    console.log(JSON.stringify({ block, variant, ...summary, errors }));
    assert.deepEqual(errors, []);
    assert.ok(result.engineSeconds >= result.wallSeconds * 0.75);
  }
} finally {
  await browser.close();
}
