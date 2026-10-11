import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { SAVE_KEY, prepareImport } from "../src/save.js";
import { traderStock, traderPrice } from "../src/trader.js";
import { rank } from "../src/content.js";
import { observeUpgradeComparisons } from "./upgrade-observation.js";

const artifact = process.argv[2] || "weaving-trader";
const outputTag =
  process.argv.find((arg) => arg.startsWith("--tag="))?.slice(6) || artifact;
if (!/^[a-z0-9-]+$/.test(artifact))
  throw new Error("Expected a plain artifact name");
if (!/^[a-z0-9-]+$/.test(outputTag))
  throw new Error("Expected a plain output tag");
const destination = ".mdxr/20261007195700-echo-loom/assets";
const testPreviews = process.argv.includes("--preview");
const record = await readFile(`${destination}/trader-arrival-${artifact}.json`);
const initial = prepareImport(record.toString()).profile.run;
assert.equal(initial.checkpoint, "shop");
const expectedStock = traderStock(initial);
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
  await page.goto("http://127.0.0.1:4173/");
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
    name: "trader-from-real-expedition.json",
    mimeType: "application/json",
    buffer: record,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
  const saved = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)).run, SAVE_KEY);
  const stock = () =>
    page
      .locator('[data-action="buy"]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.id));
  assert.deepEqual(
    await stock(),
    expectedStock.map((u) => u.id),
  );
  assert.deepEqual(await saved(), initial);
  const upgradePreviews = testPreviews
    ? { arrival: await observeUpgradeComparisons(page, "buy") }
    : null;
  const purchased = expectedStock.find((u) => initial.scrap >= traderPrice(u));
  assert.ok(
    purchased,
    "Earn enough scrap in the actual fresh expedition to buy a fragment",
  );
  await page.locator(`[data-action="buy"][data-id="${purchased.id}"]`).click();
  const paid = await saved();
  assert.equal(paid.scrap, initial.scrap - traderPrice(purchased));
  assert.equal(rank(paid, purchased.id), rank(initial, purchased.id) + 1);
  assert.deepEqual(paid.shopBought, [purchased.id]);
  assert.deepEqual(
    await stock(),
    expectedStock.map((u) => u.id),
  );
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  assert.deepEqual(await saved(), paid);
  assert.deepEqual(
    await stock(),
    expectedStock.map((u) => u.id),
  );
  assert.equal(
    await page
      .locator(`[data-action="buy"][data-id="${purchased.id}"]`)
      .isEnabled(),
    false,
  );
  if (testPreviews) {
    upgradePreviews.paid = await observeUpgradeComparisons(page, "buy");
    assert.equal(
      upgradePreviews.paid.cards.find((c) => c.id === purchased.id).mode,
      "current",
    );
  }
  await page.screenshot({
    path: `${destination}/trader-offline-${outputTag}.png`,
  });
  await page.reload();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const backup = await readFile(await (await exported).path());
  assert.deepEqual(prepareImport(backup.toString()).profile.run, paid);
  await page.locator("#save-file").setInputFiles({
    name: "trader-paid-offline.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
  assert.deepEqual(await saved(), paid);
  await page.locator('[data-action="campdone"]').click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  assert.equal(await page.locator('[data-action="buy"]').count(), 0);
  const completed = await saved();
  assert.equal(completed.checkpoint, "cleared");
  assert.equal(completed.scrap, paid.scrap);
  assert.deepEqual(completed.upgrades, paid.upgrades);
  assert.deepEqual(errors, []);
  const report = {
    environment:
      "Production service-worker cache, offline; actual trader-arrival backup exported from a fresh 24-room native keyboard expedition, imported through the public UI. Native purchase, offline reload, export/import and trader exit; no development diagnostics or combat/health/clock edits. This isolated trader check does not establish human enjoyment or hardware compatibility.",
    assetFiles,
    initial,
    purchased: { id: purchased.id, cost: traderPrice(purchased) },
    stock: expectedStock.map((u) => u.id),
    paid,
    completed,
    upgradePreviews,
    errors,
  };
  await writeFile(
    `${destination}/trader-offline-${outputTag}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      outcome: "pass",
      assetFiles,
      cost: report.purchased.cost,
      scrapBefore: initial.scrap,
      scrapAfter: paid.scrap,
      errors,
    }),
  );
} finally {
  await browser.close();
}
