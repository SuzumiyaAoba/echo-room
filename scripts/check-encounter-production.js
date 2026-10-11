import { productionURL } from "./browser-url.js";
import {
  observationDirectory,
  observationInputPath,
} from "./observation-files.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { SAVE_KEY, prepareImport } from "../src/save.js";

const assets = observationDirectory;
const sourceArtifact = "encounter-entry-tactics-weaving-17.json";
const bytes = await readFile(await observationInputPath(`${sourceArtifact}`));
const initial = prepareImport(bytes.toString()).profile;
assert.equal(initial.run.stage, 17);
assert.equal(initial.run.encounterVersion, 1);
assert.equal(initial.run.checkpoint, "entry");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 850 },
});
const page = await context.newPage();
const errors = [],
  held = new Set(),
  inputs = [];
page.on("pageerror", (e) => errors.push(e.message));
await context.tracing.start({ snapshots: true, sources: true });
const saved = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
async function keys(wanted) {
  for (const k of [...held])
    if (!wanted.includes(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
  for (const k of wanted)
    if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
}
const started = Date.now();
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
  assert.equal(
    await page.evaluate(() => typeof window.__ECHO_LOOM__),
    "undefined",
  );
  const cache = await page.evaluate(async () =>
    Promise.all(
      (await caches.keys())
        .filter((n) => n.startsWith("echo-loom-"))
        .map(async (name) => ({
          name,
          urls: (await (await caches.open(name)).keys()).map((r) => r.url),
        })),
    ),
  );
  assert.equal(cache.length, 1);
  assert.equal(cache[0].urls.length, 6);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "earned-encounter.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
  assert.deepEqual((await saved()).run, initial.run);
  let cleared = false;
  for (let step = 0; step < 600; step++) {
    if (await page.locator('[data-action="upgrade"]').count()) {
      cleared = true;
      break;
    }
    assert.equal(
      await page
        .getByRole("heading", { name: "灯りは、またともる", exact: true })
        .isVisible(),
      false,
    );
    const angle = ((Date.now() - started) / 1000) * 0.6 - Math.PI / 2;
    const wanted = ["KeyJ"];
    if (Math.cos(angle) > 0.25) wanted.push("KeyD");
    if (Math.cos(angle) < -0.25) wanted.push("KeyA");
    if (Math.sin(angle) > 0.25) wanted.push("KeyS");
    if (Math.sin(angle) < -0.25) wanted.push("KeyW");
    await keys(wanted);
    if (step % 8 === 4) await page.keyboard.press("KeyQ");
    if (step % 16 === 0) await page.keyboard.press("KeyR");
    if (step % 8 === 0) await page.keyboard.press("Space");
    if (step % 16 === 0)
      inputs.push({
        step,
        health: await page.locator("#health-number").textContent(),
      });
    await page.waitForTimeout(250);
  }
  assert.equal(cleared, true, "Natural ordinary-room clear within 150 seconds");
  await keys([]);
  await page.screenshot({ path: `${assets}/tactics-offline-reward.png` });
  await page.locator('[data-action="upgrade"]').first().click();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".toast"));
  await page.waitForTimeout(150);
  const frozen = () =>
    page.evaluate(
      (key) => ({
        profile: JSON.parse(localStorage.getItem(key)),
        body: document.body.innerText,
        pixels: document.querySelector("#world").toDataURL(),
      }),
      SAVE_KEY,
    );
  const before = await frozen();
  await page.waitForTimeout(350);
  assert.deepEqual(await frozen(), before);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const completed = await saved();
  assert.equal(completed.run.encounterVersion, 1);
  assert.equal(completed.run.checkpoint, "cleared");
  assert.ok(completed.run.kills > initial.run.kills);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const file = await download;
  const exported = await readFile(await file.path());
  assert.deepEqual(prepareImport(exported.toString()).profile, completed);
  await writeFile(`${assets}/tactics-offline-export.json`, exported);
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await page.keyboard.press("Escape");
  assert.deepEqual(await saved(), completed);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "actual-export.json",
    mimeType: "application/json",
    buffer: exported,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  assert.deepEqual(await saved(), completed);
  assert.deepEqual(errors, []);
  await writeFile(
    `${assets}/tactics-offline.json`,
    JSON.stringify(
      {
        outcome: "pass",
        scope:
          "Offline production six-asset cache, no development hooks. Public import of an unchanged genuinely earned stage-17 entry, only native keys, natural ordinary encounter clear, exact 350 ms RGBA/body/profile pause, public file export and full profile reload/reimport. No fresh full expedition claim.",
        sourceArtifact,
        cache,
        initial,
        completed,
        inputs,
        pauseExact: true,
        reloadExact: true,
        exportReimportExact: true,
        wallSeconds: (Date.now() - started) / 1000,
        errors,
      },
      null,
      2,
    ),
  );
  await context.tracing.stop();
  console.log(
    JSON.stringify({
      outcome: "pass",
      kills: completed.run.kills - initial.run.kills,
      cache: cache[0].name,
      wallSeconds: (Date.now() - started) / 1000,
    }),
  );
} catch (error) {
  await page
    .screenshot({ path: `${assets}/tactics-offline-failure.png` })
    .catch(() => {});
  await context.tracing
    .stop({ path: `${assets}/tactics-offline-failure.zip` })
    .catch(() => {});
  await writeFile(
    `${assets}/tactics-offline-failure.json`,
    JSON.stringify({ error: error.message, inputs, errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
