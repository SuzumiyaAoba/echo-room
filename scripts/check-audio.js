import { developmentURL } from "./browser-url.js";
import { observationDirectory } from "./observation-files.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { renderAudio } from "./audio-render.js";

const destination = observationDirectory;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(developmentURL);
  const effects = [
    "shoot",
    "scatter",
    "prism",
    "threadguard",
    "counter",
    "stitch",
    "dash",
    "bell",
    "echo",
    "burst",
    "hurt",
    "kill",
    "enemyshoot",
    "warning",
    "impact",
    "charge",
    "coin",
    "heal",
    "clear",
    "upgrade",
    "bossdeath",
    "ui",
    "unweave",
    "shield",
    "spawn",
  ].map((id) => ({ id, at: 0.6 }));
  const cases = [
    ...["harbor", "garden", "furnace", "dawn"].map((track) => ({
      name: `soundtrack-${track}`,
      track,
      mood: track === "dawn" ? "rest" : "combat",
      wave: true,
    })),
    { name: "harbor-rest", track: "harbor", mood: "rest" },
    { name: "harbor-echo", track: "harbor", mood: "combat", echoes: 1 },
    {
      name: "furnace-boss",
      track: "furnace",
      mood: "boss",
      echoes: 2,
      effects,
      wave: true,
    },
    {
      name: "silence",
      track: "furnace",
      mood: "boss",
      seconds: 2,
      settings: { music: 0, effects: 0 },
      effects,
    },
  ];
  const results = [];
  for (const scenario of cases) {
    const { wave, ...metrics } = await renderAudio(page, scenario);
    assert.equal(metrics.invalid, 0);
    assert.equal(metrics.clipped, 0);
    assert.equal(metrics.voicesAfter, 0);
    assert.ok(metrics.peak < 0.95);
    if (scenario.name === "silence") assert.equal(metrics.peak, 0);
    else assert.ok(metrics.rms > 0.001);
    if (wave)
      await writeFile(
        `${destination}/${scenario.name}.wav`,
        Buffer.from(wave, "base64"),
      );
    results.push({ name: scenario.name, ...metrics });
    console.log(JSON.stringify(results.at(-1)));
  }
  await writeFile(
    `${destination}/audio.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: native stereo renders, full volume mix without clipping, silence, finished voice cleanup; five WAV previews saved.",
  );
} finally {
  await browser.close();
}
