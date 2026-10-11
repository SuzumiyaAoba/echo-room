import { productionURL } from "./browser-url.js";
import { observationDirectory } from "./observation-files.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createRun } from "../src/game.js";
import { freshProfile, exportProfile, SAVE_KEY } from "../src/save.js";

const destination = observationDirectory;
const tag = process.argv.find((arg) => arg.startsWith("--tag="))?.slice(6);
if (tag && !/^[a-z0-9-]+$/.test(tag))
  throw new Error("Expected a simple artifact tag");
const artifact = `prism-offline${tag ? `-${tag}` : ""}`;
const fixture = freshProfile();
fixture.unlocked.push("prism");
fixture.attempts = 2;
fixture.run = createRun("OFFLINE-LENS", "prism");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
    name: "prism-entry-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportProfile(fixture)),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const started = Date.now();
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyD");
  const box = await page.locator("#world").boundingBox();
  await page.mouse.move(
    box.x + (150 * box.width) / 480,
    box.y + (235 * box.height) / 300,
  );
  await page.keyboard.press("KeyQ");
  await page.mouse.down();
  await page
    .getByText("硝子針に二つの光片が加わりました。", { exact: false })
    .waitFor({ timeout: 5000 });
  await page.mouse.up();
  await page.screenshot({ path: `${destination}/${artifact}-split.png` });
  // Manual pointer aim stays active; choose automatic aim through the public UI
  // before using the keyboard-only combat pilot.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-autoAim").check();
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down("KeyJ");
  let moving = null;
  for (let step = 0; step < 150; step++) {
    if (await page.locator('[data-action="upgrade"]').count()) break;
    assert.equal(
      await page.locator(".result-title").count(),
      0,
      "Survive the actual harbor room",
    );
    const next = ["KeyW", "KeyA", "KeyS", "KeyD"][Math.floor(step / 2) % 4];
    if (moving !== next) {
      if (moving) await page.keyboard.up(moving);
      await page.keyboard.down(next);
      moving = next;
    }
    if (step % 6 === 0) await page.keyboard.press("KeyQ");
    if (step % 11 === 0) await page.keyboard.press("KeyR");
    if (step % 5 === 0) await page.keyboard.press("Space");
    await page.waitForTimeout(450);
  }
  if (moving) await page.keyboard.up(moving);
  await page.keyboard.up("KeyJ");
  const card = page.locator('[data-action="upgrade"]').first();
  await card.waitFor();
  await page.screenshot({ path: `${destination}/${artifact}-reward.png` });
  await card.click();
  const run = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).run,
    SAVE_KEY,
  );
  assert.equal(run.stage, 0);
  assert.equal(run.checkpoint, "cleared");
  assert.ok(run.prismSplits >= 1 && run.kills > 0 && run.hp > 0);
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  assert.equal(await page.locator('[data-action="upgrade"]').count(), 0);
  const restored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).run,
    SAVE_KEY,
  );
  assert.equal(restored.prismSplits, run.prismSplits);
  assert.equal(restored.kills, run.kills);
  assert.deepEqual(errors, []);
  const report = {
    environment:
      "Production service-worker cache, offline; unupgraded prism harbor-entry backup imported through the public UI. Native movement records a real echo, native mouse aim fires through it, native keyboard/auto-aim clears the actual seeded enemies. No development diagnostics, encounter injection, combat/health/clock edits. One room, not human enjoyment or a whole offline expedition.",
    wallSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    assetFiles,
    run,
    restoredPrismSplits: restored.prismSplits,
    errors,
  };
  await writeFile(
    `${destination}/${artifact}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      outcome: "pass",
      kills: run.kills,
      prismSplits: run.prismSplits,
      hp: run.hp,
      errors,
    }),
  );
} finally {
  await browser.close();
}
