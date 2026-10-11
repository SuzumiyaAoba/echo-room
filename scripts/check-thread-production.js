import { productionURL } from "./browser-url.js";
import { observationDirectory } from "./observation-files.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { SAVE_KEY } from "../src/save.js";

const destination = observationDirectory;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  const assetFiles = await page.evaluate(() =>
    [...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(
      (el) => (el.src || el.href).split("/").at(-1),
    ),
  );
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    SAVE_KEY,
  );
  const steps = [];
  const observe = async () => {
    const state = await page.locator(".practice-guide").innerText();
    steps.push(state);
  };
  const title = async (text) =>
    page.waitForFunction(
      (text) =>
        document.querySelector("#practice-title")?.textContent.includes(text),
      text,
    );
  const hint = async (text) =>
    page.waitForFunction(
      (text) =>
        document.querySelector("#practice-hint")?.textContent.includes(text),
      text,
    );
  const moveUntil = async (key, until) => {
    await page.keyboard.down(key);
    try {
      await until();
    } finally {
      await page.keyboard.up(key);
    }
  };
  const hold = async (key, milliseconds) =>
    moveUntil(key, () => page.waitForTimeout(milliseconds));
  await page.getByRole("button", { name: "灯りの練習", exact: true }).click();
  await observe();
  await moveUntil("KeyA", () => title("影を撃つ"));
  await observe();
  await moveUntil("KeyJ", () => title("一歩をすり抜ける"));
  await observe();
  await page.keyboard.down("KeyD");
  await page.keyboard.press("Space");
  try {
    await title("昨日と糸を張る");
  } finally {
    await page.keyboard.up("KeyD");
  }
  await observe();
  await hold("KeyW", 650);
  await moveUntil("KeyA", () => hint("右の輪まで歩いてQ"));
  await hold("KeyD", 2100);
  await page.keyboard.press("KeyQ");
  await hint("糸の中ほどへ来る弾");
  await observe();
  await page.screenshot({
    path: `${destination}/thread-guard-practice-offline.png`,
  });
  await title("光をほどく");
  await observe();
  await hint("今の残響なら");
  await page.keyboard.press("KeyR");
  await page
    .getByRole("heading", { name: "最初の光が織れました", exact: true })
    .waitFor();
  await page.screenshot({
    path: `${destination}/thread-guard-practice-complete.png`,
  });
  assert.ok(
    steps.some((step) => step.includes("糸の中ほどへ来る弾")),
    "Observe the actual thread-guard exercise before it completes",
  );
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
    before,
  );
  await page.locator('[data-action="practiceexit"]').first().click();
  await page.reload();
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
    before,
  );
  assert.equal(
    await page.getByRole("button", { name: "灯りの練習", exact: true }).count(),
    1,
  );
  assert.deepEqual(errors, []);
  const report = {
    environment:
      "Native headless Chromium, production service-worker cache, offline; all five practice exercises including the real thread-guard phase completed through public UI and ordinary keyboard input. No development diagnostics, injected projectiles or changed game state. Practice targets are harmless by design; this does not establish expedition difficulty, human enjoyment or hardware compatibility. Native silent audio output.",
    assetFiles,
    steps,
    savedProfileUnchanged: true,
    completed: true,
    errors,
  };
  await writeFile(
    `${destination}/thread-guard-practice-offline.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ outcome: "pass", assetFiles, steps, errors }));
} finally {
  await browser.close();
}
