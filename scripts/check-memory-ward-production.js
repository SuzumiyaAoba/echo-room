import { productionURL } from "./browser-url.js";
import {
  observationDirectory,
  observationInputPath,
} from "./observation-files.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY, prepareImport } from "../src/save.js";

const artifact = process.argv[2] || "weaving-memory-ward";
if (!/^[a-z0-9-]+$/.test(artifact))
  throw new Error("Expected a plain artifact name");
const destination = observationDirectory;
const sourceArtifact = `memory-ward-arrival-${artifact}.json`;
const record = await readFile(await observationInputPath(`${sourceArtifact}`));
const initial = prepareImport(record.toString()).profile;
const provenance = JSON.parse(
  await readFile(
    await observationInputPath(`expedition-${artifact}.json`),
    "utf8",
  ),
);
assert.equal(provenance.outcome, "victory");
assert.equal(provenance.stages.length, 24);
assert.equal(initial.run.stage, 23);
assert.equal(initial.run.checkpoint, "entry");
assert.equal(provenance.memoryWardCheckpoint.hp, initial.run.hp);
assert.equal(provenance.memoryWardCheckpoint.gameSeconds, initial.run.time);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 850 },
});
await context.tracing.start({ snapshots: true, sources: true });
const page = await context.newPage();
const errors = [],
  observations = [],
  inputs = [],
  held = new Set();
page.on("pageerror", (e) => errors.push(e.message));
let pauseEvidence = null;
const saved = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const visible = () =>
  page.evaluate(() => ({
    state: document.querySelector("#boss-ward")?.dataset.state,
    text: document.querySelector("#boss-ward-state")?.textContent,
    intent: document.querySelector("#boss-intent")?.textContent,
    countdown: document.querySelector("#boss-countdown")?.textContent,
    telegraphVisible: !document.querySelector("#boss-telegraph")?.hidden,
    echoes: document.querySelector("#burst-status")?.textContent,
    time: document.querySelector("#run-time")?.textContent,
    ended: !!document.querySelector('[data-action="again"]'),
    body: document.querySelector('[data-action="again"]')
      ? document.body.innerText
      : null,
  }));
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
try {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options) {
        super({ ...options, sinkId: { type: "none" } });
      }
    };
  });
  await page.goto(productionURL);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  const assetFiles = await page.evaluate(() =>
    [...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(
      (el) => (el.src || el.href).split("/").at(-1),
    ),
  );
  assert.equal(
    await page.evaluate(() => typeof window.__ECHO_LOOM__),
    "undefined",
  );
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "actually-earned-final-room.json",
    mimeType: "application/json",
    buffer: record,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
  assert.deepEqual((await saved()).run, initial.run);
  const started = Date.now();
  let final;
  // Follow a regular orbit with native direction keys and public HUD readings.
  // No simulation hooks, enemy positions, health, history or clocks are edited.
  for (let step = 0; step < 960; step++) {
    const v = await visible(),
      seconds = (Date.now() - started) / 1000;
    if (v.ended) {
      final = v;
      break;
    }
    if (v.state && observations.at(-1)?.state !== v.state) {
      observations.push({ seconds, ...v });
      console.log(
        JSON.stringify({
          event: "ward",
          seconds,
          state: v.state,
          text: v.text,
        }),
      );
      if (
        ["closed", "open"].includes(v.state) &&
        observations.filter((o) => o.state === v.state).length === 1
      )
        await page.screenshot({
          path: `${destination}/memory-ward-offline-${v.state}.png`,
        });
    }
    if (v.state === "open" && !pauseEvidence) {
      await keys([]);
      await page.getByRole("button", { name: "一時停止", exact: true }).click();
      await page.waitForTimeout(150);
      const before = { ui: await visible(), saved: await saved() };
      await page.waitForTimeout(400);
      const after = { ui: await visible(), saved: await saved() };
      assert.deepEqual(after, before);
      pauseEvidence = { before, after, durationMs: 400 };
      await page
        .getByRole("button", { name: "航路へ戻る", exact: true })
        .click();
    }
    const angle = seconds * 0.6;
    const wanted = ["KeyJ"];
    if (Math.cos(angle) > 0.25) wanted.push("KeyD");
    if (Math.cos(angle) < -0.25) wanted.push("KeyA");
    if (Math.sin(angle) > 0.25) wanted.push("KeyS");
    if (Math.sin(angle) < -0.25) wanted.push("KeyW");
    await keys(wanted);
    if (step % 8 === 4) await page.keyboard.press("KeyQ");
    if (step % 16 === 8) await page.keyboard.press("Space");
    if (step % 16 === 0 && ["closed", "weaving"].includes(v.state))
      await page.keyboard.press("KeyR");
    if (step % 8 === 0) inputs.push({ step, seconds, keys: wanted, ...v });
    await page.waitForTimeout(125);
  }
  await keys([]);
  const completed = await saved();
  const report = {
    environment:
      "Production service-worker cache, offline; import the unchanged entry earned by an actual 24-room native expedition. Keyboard pilot and public DOM HUD only, native silent audio; no development hooks or combat/history/health/clock changes. This is automated evidence, not a human enjoyment evaluation.",
    sourceArtifact,
    sourceSha256: createHash("sha256").update(record).digest("hex"),
    assetFiles,
    initial,
    observations,
    inputs,
    pauseEvidence,
    completed,
    final,
    wallSeconds: (Date.now() - started) / 1000,
    errors,
  };
  await writeFile(
    `${destination}/memory-ward-offline.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  assert.ok(
    final?.ended,
    "Finish the actual final fight within the observation window",
  );
  assert.equal(
    completed.victories,
    initial.victories + 1,
    "Reach the actual victory screen",
  );
  assert.equal(completed.run, null);
  assert.ok(
    observations.some((o) => o.state === "open") && pauseEvidence,
    "Open and pause the actual ward offline",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: `${destination}/memory-ward-offline-victory.png`,
  });
  await page.reload();
  assert.deepEqual(
    await saved(),
    completed,
    "Keep the actual victory after an offline reload",
  );
  await writeFile(
    `${destination}/memory-ward-offline.json`,
    JSON.stringify({ ...report, reloadPreserved: true }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      outcome: "pass",
      openings: observations.filter((o) => o.state === "open").length,
      wallSeconds: report.wallSeconds,
      victories: completed.victories,
      assetFiles,
      errors,
    }),
  );
} catch (error) {
  await page
    .screenshot({ path: `${destination}/memory-ward-offline-failure.png` })
    .catch(() => {});
  await context.tracing
    .stop({ path: `${destination}/memory-ward-offline-failure-trace.zip` })
    .catch(() => {});
  await writeFile(
    `${destination}/memory-ward-offline-failure.json`,
    JSON.stringify(
      {
        error: error.stack,
        visible: await visible().catch(() => null),
        saved: await saved().catch(() => null),
        observations,
        inputs,
        pauseEvidence,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser.close();
}
