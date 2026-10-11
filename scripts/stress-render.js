import { chromium } from "@playwright/test";
import { createRun } from "../src/game.js";
import { UPGRADES } from "../src/content.js";
import { freshProfile, SAVE_KEY } from "../src/save.js";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { withLegacyPixelLine } from "./line-reference.js";
import { readFileSync } from "node:fs";

const cpuRate = Number(process.argv[2] || 1);
if (!Number.isFinite(cpuRate) || cpuRate < 1 || cpuRate > 10)
  throw new Error("Expected a CPU slowdown factor between one and ten");
const tag = process.argv.find((arg) => arg.startsWith("--tag="))?.slice(6);
if (tag && !/^[a-z0-9-]+$/.test(tag))
  throw new Error("Expected a simple lower-case artifact tag");
const artifact = [cpuRate === 1 ? "stress" : `stress-cpu${cpuRate}`, tag]
  .filter(Boolean)
  .join("-");
const profiling = process.argv.includes("--profile");
const legacyLines = process.argv.includes("--legacy-lines");
const profile = freshProfile();
profile.run = createRun("SYNTHETIC-RENDER-STRESS");
profile.run.stage = 20;
profile.run.upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
profile.attempts = 2;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1200, height: 850 },
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://127.0.0.1:5173",
        localStorage: [{ name: SAVE_KEY, value: JSON.stringify(profile) }],
      },
    ],
  },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
if (legacyLines) {
  const source = withLegacyPixelLine(readFileSync("src/art.js", "utf8"));
  await page.route("http://127.0.0.1:5173/src/art.js*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: source }),
  );
}
await page.addInitScript(() => {
  const NativeAudioContext = window.AudioContext;
  window.AudioContext = class extends NativeAudioContext {
    constructor(options) {
      super({ ...options, sinkId: { type: "none" } });
    }
  };
});
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
await page.goto("http://127.0.0.1:5173");
await page.locator('[data-action="continue"]').click();
await page.bringToFront();
await page.evaluate(() => {
  const g = window.__ECHO_LOOM__.game();
  // Artificial high load, explicitly separate from encounter balance tests.
  // Health and lifetime are extended solely to hold a reproducible scene.
  g.spawnQueue = [];
  g.enemies = [];
  g.player.invulnerable = 10000;
  const kinds = ["crawler", "shooter", "charger", "shield", "moth", "weaver"];
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
if (profiling) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
}
const result = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const times = [],
        warmupTimes = [],
        slowFrames = [],
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
      function sample(now) {
        const g = window.__ECHO_LOOM__.game();
        if (now - lastRefill > 500) {
          window.__stressRefill();
          lastRefill = now;
        }
        if (previous) {
          const interval = now - previous;
          if (warmupTimes.length < 120) {
            warmupTimes.push(interval);
            started = g.run.time;
          } else {
            times.push(interval);
            if (interval > 33.4)
              slowFrames.push({ frame: times.length, intervalMs: interval });
          }
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
          g.echoes.reduce((sum, echo) => sum + (echo.returnStock || 0), 0),
        );
        if (times.length < 480) requestAnimationFrame(sample);
        else {
          const sorted = [...times].sort((a, b) => a - b);
          resolve({
            warmupFrames: warmupTimes.length,
            warmupMaxMs: Math.max(...warmupTimes),
            frames: times.length,
            engineSeconds: g.run.time - started,
            wallSeconds: times.reduce((sum, dt) => sum + dt, 0) / 1000,
            medianMs: sorted[240],
            p95Ms: sorted[456],
            maxMs: sorted.at(-1),
            slowFrames,
            peaks,
            audioSeconds: window.__ECHO_LOOM__.audio().ctx?.currentTime,
          });
        }
      }
      requestAnimationFrame(sample);
    }),
);
let profileSummary;
if (profiling) {
  const { profile: measured } = await cdp.send("Profiler.stop");
  const weights = new Map();
  for (let i = 0; i < measured.samples.length; i++) {
    const id = measured.samples[i];
    weights.set(id, (weights.get(id) || 0) + measured.timeDeltas[i] / 1000);
  }
  profileSummary = measured.nodes
    .map((node) => ({
      function: node.callFrame.functionName || "(anonymous)",
      url: node.callFrame.url,
      line: node.callFrame.lineNumber + 1,
      selfMs: Number((weights.get(node.id) || 0).toFixed(2)),
    }))
    .filter((node) => node.selfMs > 0)
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 30);
  writeFileSync(
    `.mdxr/20261007195700-echo-loom/assets/${artifact}.cpuprofile`,
    JSON.stringify(measured),
  );
}
await page.keyboard.up("KeyJ");
assert.deepEqual(errors, []);
assert.ok(
  result.engineSeconds >= result.wallSeconds * 0.75,
  "Stress scene must continue simulating while measured",
);
await page.screenshot({
  path: `.mdxr/20261007195700-echo-loom/assets/${artifact}.png`,
});
const report = {
  environment:
    "Local headless Chromium, synthetic development scene. CPU slowdown affects browser script execution and does not emulate physical device graphics, audio hardware or input.",
  cpuRate,
  catalogVersion: profile.run.catalogVersion,
  fragments: UPGRADES.length,
  profiling,
  legacyLines,
  profileSummary,
  ...result,
  errors,
};
writeFileSync(
  `.mdxr/20261007195700-echo-loom/assets/${artifact}.json`,
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    ...report,
    profileSummary: report.profileSummary?.slice(0, 8),
    slowFrames: report.slowFrames.length,
  }),
);
await browser.close();
