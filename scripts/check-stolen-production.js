import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createRun } from "../src/game.js";
import { freshProfile, exportProfile, SAVE_KEY } from "../src/save.js";

const destination = ".mdxr/20261007195700-echo-loom/assets";
const fixture = freshProfile();
fixture.attempts = 1;
fixture.run = createRun("EXPEDITION-STOLEN-YESTERDAY");
fixture.run.stage = 8;
fixture.run.upgrades = { damage: 2, rapid: 1, quickecho: 1, health: 2 };
fixture.run.hp = fixture.run.maxHp = 140;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  assert.equal(
    await page.evaluate(() => typeof window.__ECHO_LOOM__),
    "undefined",
  );
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "garden-entry-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportProfile(fixture)),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const started = Date.now();
  let moving = null,
    sawWarning = false;
  // Real seeded enemies, public controls only; no injected encounter or clock.
  for (let step = 0; step < 150; step++) {
    if (await page.locator('[data-action="upgrade"]').count()) break;
    assert.equal(
      await page.locator(".result-title").count(),
      0,
      "Survive the real garden room",
    );
    const next = ["KeyD", "KeyW", "KeyA", "KeyS"][Math.floor(step / 2) % 4];
    if (next !== moving) {
      if (moving) await page.keyboard.up(moving);
      await page.keyboard.down(next);
      moving = next;
    }
    if (
      !sawWarning &&
      (await page
        .getByText("糸喰いが昨日を逆走する。", { exact: false })
        .count())
    ) {
      sawWarning = true;
      await page.screenshot({
        path: `${destination}/stolen-offline-warning.png`,
      });
      await page.keyboard.press("KeyQ");
      await page.keyboard.press("KeyR");
      await page.keyboard.down("KeyJ");
    }
    if (sawWarning) {
      if (step % 6 === 0) await page.keyboard.press("KeyQ");
      if (step % 11 === 0) await page.keyboard.press("KeyR");
      if (step % 5 === 0) await page.keyboard.press("Space");
    }
    await page.waitForTimeout(450);
  }
  if (moving) await page.keyboard.up(moving);
  await page.keyboard.up("KeyJ");
  assert.equal(sawWarning, true, "Observe the native stolen-route warning");
  const card = page.locator('[data-action="upgrade"]').first();
  await card.waitFor();
  await page.screenshot({ path: `${destination}/stolen-offline-reward.png` });
  await card.click();
  const run = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).run,
    SAVE_KEY,
  );
  assert.equal(run.stage, 8);
  assert.equal(run.checkpoint, "cleared");
  assert.ok(
    run.memoryCuts >= 1,
    "Reclaim an actual stolen route through native controls",
  );
  assert.ok(run.hp > 0 && run.kills > 0 && run.echoesCast > 0);
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  assert.equal(await page.locator('[data-action="upgrade"]').count(), 0);
  const restored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).run,
    SAVE_KEY,
  );
  assert.equal(restored.memoryCuts, run.memoryCuts);
  assert.equal(restored.kills, run.kills);
  assert.deepEqual(errors, []);
  await writeFile(
    `${destination}/stolen-offline.json`,
    JSON.stringify(
      {
        environment:
          "Production service-worker cache, offline; garden entry backup with four legitimate mid-run upgrade types imported through the public UI. Real seeded enemies, native movement/Q/R/dash/auto-aim shooting, no debug hooks or combat/health/clock edits. One encounter, not a fresh whole expedition or human enjoyment evaluation.",
        wallSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        fixtureUpgrades: fixture.run.upgrades,
        sawWarning,
        run,
        restoredMemoryCuts: restored.memoryCuts,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      outcome: "pass",
      kills: run.kills,
      memoryCuts: run.memoryCuts,
      hp: run.hp,
      errors,
    }),
  );
} finally {
  await browser.close();
}
