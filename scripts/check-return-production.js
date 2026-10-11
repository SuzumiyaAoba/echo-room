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
import { normalizeReturnRecord, returnReadout } from "../src/return-record.js";

const destination = observationDirectory;
const sourceArtifact = "memory-ward-arrival-needle-stitch-weaving.json";
const bytes = await readFile(await observationInputPath(`${sourceArtifact}`));
const initial = prepareImport(bytes.toString()).profile;
assert.equal(initial.run.stage, 23);
assert.equal(initial.run.checkpoint, "entry");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 850 },
  hasTouch: true,
});
await context.tracing.start({ snapshots: true, sources: true });
const page = await context.newPage();
const errors = [],
  held = new Set(),
  inputs = [],
  sizes = [];
page.on("pageerror", (e) => errors.push(e.message));
const saved = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const pixels = () =>
  page.evaluate(async () => {
    const c = document.querySelector("#world");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    return [...new Uint8Array(digest)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  });
const frozen = async () => ({
  save: await saved(),
  pixels: await pixels(),
  body: await page.locator("body").innerText(),
});
async function exactPause() {
  await page.waitForTimeout(100);
  const before = await frozen();
  await page.waitForTimeout(350);
  assert.deepEqual(await frozen(), before);
  return before;
}
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
let completed, cache, victoryPause;
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
  cache = await page.evaluate(async () =>
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
  assert.equal(
    await page.evaluate(() => typeof window.__ECHO_LOOM__),
    "undefined",
  );
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "earned-entry.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-autoAim").check();
  await page.locator("#setting-flashes").uncheck();
  await page.locator("#setting-shake").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.locator('[data-action="continue"]').click();
  assert.deepEqual((await saved()).run, initial.run);
  let won = false;
  for (let step = 0; step < 560; step++) {
    if (
      await page
        .getByRole("heading", { name: "明日の灯り", exact: true })
        .isVisible()
    ) {
      won = true;
      break;
    }
    assert.equal(
      await page
        .getByRole("heading", { name: "灯りは、またともる", exact: true })
        .isVisible(),
      false,
    );
    const seconds = (Date.now() - started) / 1000,
      angle = seconds * 0.6,
      wanted = ["KeyJ"];
    if (Math.cos(angle) > 0.25) wanted.push("KeyD");
    if (Math.cos(angle) < -0.25) wanted.push("KeyA");
    if (Math.sin(angle) > 0.25) wanted.push("KeyS");
    if (Math.sin(angle) < -0.25) wanted.push("KeyW");
    await keys(wanted);
    if (step % 8 === 4) await page.keyboard.press("KeyQ");
    if (step % 16 === 8) await page.keyboard.press("Space");
    if (step % 16 === 0) await page.keyboard.press("KeyR");
    if (step % 16 === 0)
      inputs.push({
        step,
        seconds,
        keys: wanted,
        health: await page.locator("#health-number").textContent(),
        echoes: await page.locator("#burst-status").textContent(),
      });
    await page.waitForTimeout(100);
  }
  await keys([]);
  assert.ok(won, "Win the actual final room through public controls");
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .getByRole("heading", { name: "明日の灯り", exact: true })
      .isVisible(),
    true,
  );
  completed = await saved();
  assert.equal(completed.run, null);
  assert.equal(completed.victories, initial.victories + 1);
  const record = completed.lastReturn,
    readout = returnReadout(record);
  assert.deepEqual(normalizeReturnRecord(record), record);
  assert.equal(record.outcome, "victory");
  assert.equal(record.run.stage, 23);
  assert.equal(record.run.seed, initial.run.seed);
  assert.deepEqual(
    record.run.upgrades,
    Object.fromEntries(
      Object.entries(initial.run.upgrades).filter(([, level]) => level > 0),
    ),
  );
  assert.ok(record.run.needleStitches > initial.run.needleStitches);
  assert.ok(record.run.echoesCast > initial.run.echoesCast);
  assert.equal(
    record.memory,
    Math.floor(record.run.kills * 0.45) + 16 + initial.run.memory + 35,
  );
  await page.locator(".return-build > summary").click();
  await page.locator(".return-performance > summary").click();
  assert.equal(
    await page.locator("[data-return-fragment]").count(),
    readout.fragments.length,
  );
  victoryPause = await exactPause();
  await page.screenshot({ path: `${destination}/return-offline-victory.png` });
  await page.getByRole("button", { name: "灯台へ帰る", exact: true }).click();
  await page.reload();
  assert.deepEqual(await saved(), completed);
  for (const viewport of [
    { width: 640, height: 360 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "直近の旅", exact: true }).tap();
    await page.locator(".return-build > summary").tap();
    await page
      .locator("[data-return-fragment]")
      .last()
      .scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const fields = [
        ...document.querySelectorAll(
          ".return-fragment h3,.return-fragment p,.return-overview summary",
        ),
      ];
      const button = document.querySelector('[data-action="returnagain"]'),
        b = button.getBoundingClientRect();
      return {
        noOverflow:
          document.documentElement.scrollWidth <= innerWidth &&
          fields.every((e) => e.scrollWidth <= e.clientWidth + 1),
        minFont: Math.min(
          ...fields.map((e) => parseFloat(getComputedStyle(e).fontSize)),
        ),
        buttonHeight: b.height,
        buttonHit:
          document
            .elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
            ?.closest("button") === button,
      };
    });
    assert.ok(
      layout.noOverflow &&
        layout.minFont >= 10 &&
        layout.buttonHeight >= 40 &&
        layout.buttonHit,
    );
    // With no active Game the title sky still animates. The book and saved
    // profile are read-only; full battle pixels were checked at victory.
    const before = {
      save: await saved(),
      body: await page.getByRole("dialog").innerText(),
      pixels: await pixels(),
    };
    await page.waitForTimeout(350);
    const after = {
      save: await saved(),
      body: await page.getByRole("dialog").innerText(),
      pixels: await pixels(),
    };
    assert.deepEqual(after.save, before.save);
    assert.equal(after.body, before.body);
    const pause = {
      durationMs: 350,
      recordAndTextUnchanged: true,
      animatedTitlePixelsEqual: before.pixels === after.pixels,
      before,
      after,
    };
    await page.screenshot({
      path: `${destination}/return-offline-book-${viewport.width}x${viewport.height}.png`,
    });
    sizes.push({ viewport, layout, pause });
    await page.getByRole("button", { name: "灯台へ戻る", exact: true }).tap();
  }
  await page.getByRole("button", { name: "設定", exact: true }).tap();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "記録を書き出す", exact: true }).tap();
  const exported = await readFile(await (await download).path());
  assert.deepEqual(prepareImport(exported.toString()).profile, completed);
  await writeFile(`${destination}/return-offline-export.json`, exported);
  await page.locator("#save-file").setInputFiles({
    name: "completed.json",
    mimeType: "application/json",
    buffer: exported,
  });
  await page.getByRole("button", { name: "記録を取り込む", exact: true }).tap();
  assert.deepEqual(await saved(), completed);
  await page.reload();
  assert.deepEqual(await saved(), completed);
  assert.deepEqual(errors, []);
  const report = {
    outcome: "pass",
    scope:
      "Current production six-asset cache, offline and no development hooks. Unchanged final-room entry earned in the earlier complete 24-room needle expedition, public import/preferences then only native direction/J/Q/R/Space and natural victory. Native audio sink only. At victory: exact 350ms full battle RGBA/body/profile pause. Offline reload/book at three sizes: saved profile and book text unchanged for 350ms, while the normal title sky animates without a Game. Actual touch and full file export/reimport. Not a fresh complete expedition or a human enjoyment evaluation.",
    sourceArtifact,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    cache,
    initial,
    completed,
    readout,
    inputs,
    victoryPause,
    sizes,
    reloadPreserved: true,
    exportReimportExact: true,
    wallSeconds: (Date.now() - started) / 1000,
    errors,
  };
  await writeFile(
    `${destination}/return-offline.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      outcome: report.outcome,
      fragments: readout.fragments.length,
      levels: readout.levels,
      stitches: record.run.needleStitches,
      sizes: sizes.length,
      cache,
      wallSeconds: report.wallSeconds,
    }),
  );
} catch (error) {
  await page
    .screenshot({ path: `${destination}/return-offline-failure.png` })
    .catch(() => {});
  await context.tracing
    .stop({ path: `${destination}/return-offline-failure-trace.zip` })
    .catch(() => {});
  await writeFile(
    `${destination}/return-offline-failure.json`,
    JSON.stringify(
      {
        error: error.stack,
        cache,
        completed,
        saved: await saved().catch(() => null),
        inputs,
        sizes,
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
