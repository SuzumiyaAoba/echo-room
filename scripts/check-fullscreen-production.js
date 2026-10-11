import { productionURL } from "./browser-url.js";
import { observationPath } from "./observation-files.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { SAVE_KEY, prepareImport } from "../src/save.js";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 850 },
});
const page = await context.newPage();
const errors = [],
  layouts = [];
page.on("pageerror", (error) => errors.push(error.message));
const readSave = () =>
  page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
const pixels = () =>
  page.evaluate(async () => {
    const c = document.querySelector("#world");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    return [...new Uint8Array(digest)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  });
const nextDraw = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
async function full(active) {
  await page.locator('[data-action="fullscreen"]').click();
  await page.waitForFunction(
    (active) => Boolean(document.fullscreenElement) === active,
    active,
  );
  await page.waitForFunction(
    () => !document.querySelector('[data-action="fullscreen"]').disabled,
  );
  assert.equal(
    await page
      .locator('[data-action="fullscreen"]')
      .getAttribute("aria-pressed"),
    String(active),
  );
}
async function pausedFor350ms() {
  await nextDraw();
  const before = {
    pixels: await pixels(),
    save: await readSave(),
    time: await page.locator("#run-time").textContent(),
  };
  await page.waitForTimeout(350);
  const after = {
    pixels: await pixels(),
    save: await readSave(),
    time: await page.locator("#run-time").textContent(),
  };
  assert.deepEqual(after, before);
  return { milliseconds: 350, before, after, exact: true };
}
try {
  await page.goto(productionURL);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cache = await page.evaluate(async () => {
    const names = await caches.keys();
    const assets = (
      await (
        await caches.open(names.find((n) => n.startsWith("echo-loom-")))
      ).keys()
    ).map((r) => new URL(r.url).pathname);
    return { names, assets };
  });
  assert.equal(cache.assets.length, 6);
  await context.setOffline(true);
  await page.reload();
  assert.equal(
    await page.evaluate(() => typeof window.__ECHO_LOOM__),
    "undefined",
  );
  await full(true);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.fullscreenElement === null);
  assert.equal(
    await page.getByRole("heading", { name: "灯りの調整" }).isVisible(),
    true,
  );
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 640, height: 360 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const c = document.querySelector("#world").getBoundingClientRect();
      const b = document.querySelector('[data-action="fullscreen"]'),
        r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return {
        viewport: { width: innerWidth, height: innerHeight },
        ratio: c.width / c.height,
        button: {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          font: Number.parseFloat(getComputedStyle(b).fontSize),
          hit: hit === b || b.contains(hit),
        },
      };
    });
    assert.ok(Math.abs(layout.ratio - 1.6) < 0.0001);
    assert.ok(
      layout.button.width >= 40 &&
        layout.button.height >= 40 &&
        layout.button.font >= 10 &&
        layout.button.hit,
    );
    layouts.push(layout);
    if (viewport.width === 360)
      await page.screenshot({
        path: observationPath("echo-fullscreen-offline-home.png"),
      });
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("FULLSCREEN-OFFLINE");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.getByRole("button", { name: "最初のひと針へ" }).click();
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(150);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  await page.locator('[data-action="pause"]').click();
  const before = await pausedFor350ms();
  await full(true);
  const entered = await pausedFor350ms();
  assert.deepEqual(entered.before, before.before);
  await page.screenshot({
    path: observationPath("echo-fullscreen-offline-pause.png"),
  });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.fullscreenElement === null);
  assert.equal(
    await page.getByRole("heading", { name: "潮を待つ" }).isVisible(),
    true,
  );
  const exited = await pausedFor350ms();
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const saved = JSON.parse(await readSave());
  assert.equal(saved.run.seed, "FULLSCREEN-OFFLINE");
  assert.equal(saved.run.checkpoint, "entry");
  const settings = saved.settings;
  await full(true);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs(observationPath("echo-fullscreen-offline-export.json"));
  const exported = prepareImport(
    await readFile(
      observationPath("echo-fullscreen-offline-export.json"),
      "utf8",
    ),
  ).profile;
  // Import validation expands absent upgrade ranks to zero. Compare both
  // records through the same public import validation, preserving every field.
  const normalizedSaved = prepareImport(JSON.stringify(saved)).profile;
  assert.deepEqual(exported, normalizedSaved);
  await full(false);
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.reload();
  assert.deepEqual(JSON.parse(await readSave()), saved);
  assert.equal(await page.evaluate(() => document.fullscreenElement), null);
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await page.locator('[data-action="pause"]').click();
  const reloaded = await pausedFor350ms();
  assert.deepEqual(JSON.parse(reloaded.before.save).settings, settings);
  assert.equal(JSON.parse(reloaded.before.save).run.seed, "FULLSCREEN-OFFLINE");
  assert.deepEqual(errors, []);
  const report = {
    scope:
      "Real native Chromium Fullscreen API, public offline production UI and keyboard. Fresh public expedition; no development hooks, imported/prepared gameplay or actor/HP/history/clock mutations. 350ms pixel/HUD/save identity, public export and offline reload; not a complete expedition or physical display evaluation.",
    cache,
    layouts,
    before,
    entered,
    exited,
    reloaded,
    exportMatches: true,
    exportComparison:
      "Both exported profile and saved entry pass public import validation; absent upgrade ranks expand to zero.",
    reloadMatches: true,
    errors,
  };
  await writeFile(
    observationPath("echo-fullscreen-offline.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      cache,
      layouts: layouts.length,
      pauses: 4,
      exportMatches: true,
      reloadMatches: true,
      errors,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
