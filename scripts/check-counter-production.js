import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { SAVE_KEY, prepareImport } from "../src/save.js";
import { Game } from "../src/game.js";

const artifact = process.argv[2] || "weaving-counter";
if (!/^[a-z0-9-]+$/.test(artifact))
  throw new Error("Expected a plain artifact name");
const destination = ".mdxr/20261007195700-echo-loom/assets";
const tag = process.argv.find((arg) => arg.startsWith("--tag="))?.slice(6);
if (tag && !/^[a-z0-9-]+$/.test(tag))
  throw new Error("Expected a simple artifact tag");
const outputArtifact = `${artifact}${tag ? `-${tag}` : ""}`;
const testEchoStatus = process.argv.includes("--echo-status");
const fromTrader = process.argv.includes("--from-trader");
const sourceArtifact = `${fromTrader ? "trader-arrival" : "counter-earned"}-${artifact}.json`;
const record = await readFile(`${destination}/${sourceArtifact}`);
const initial = prepareImport(record.toString()).profile.run;
const expedition = JSON.parse(
  await readFile(`${destination}/expedition-${artifact}.json`, "utf8"),
);
const provenance = expedition;
assert.equal(initial.upgrades.counter, 1);
assert.equal(initial.catalogVersion, 2);
if (!fromTrader)
  assert.equal(provenance.counterCheckpoint.stage, initial.stage);
assert.ok(
  provenance.choices.some((c) => c.id === "counter") ||
    provenance.trades.some((t) => t.id === "counter"),
);
assert.ok(["shop", "cleared"].includes(initial.checkpoint));
// This is a precondition check of the unchanged seed, not an alteration of the
// imported backup or a substitute for observing actual hostile bullets.
const forecast = new Game({
  ...initial,
  stage: initial.stage + 1,
  route: "loom",
});
assert.ok(
  forecast.spawnQueue.some((e) => ["shooter", "moth"].includes(e.kind)),
  "Choose a genuinely earned checkpoint before a room with projectile-producing enemies",
);
const browser = await chromium.launch({ headless: true });
let context, page;
try {
  context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
  });
  await context.tracing.start({
    screenshots: false,
    snapshots: true,
    sources: true,
  });
  page = await context.newPage();
  const errors = [];
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
    name: "actually-earned-counter.json",
    mimeType: "application/json",
    buffer: record,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
  const saved = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)).run, SAVE_KEY);
  assert.deepEqual(await saved(), initial);
  const purchases = [];
  if (initial.checkpoint === "shop") {
    for (const trade of provenance.trades.filter(
      (t) => t.stage === initial.stage,
    )) {
      if (trade.type === "heal")
        await page.locator('[data-action="buyheal"]').click();
      else
        await page
          .locator(`[data-action="buy"][data-id="${trade.id}"]`)
          .click();
      purchases.push(trade);
    }
    await page.locator('[data-action="campdone"]').click();
  }
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2300);
  await page.keyboard.up("KeyW");
  await page.keyboard.press("KeyE");
  const route = page.locator('[data-action="route"][data-id="loom"]');
  await route.waitFor();
  const promised = await route.getAttribute("data-promised");
  assert.ok(
    promised,
    "An ordinary combat room after actually acquiring the fragment",
  );
  const expectedEnemies = Number(
    (
      await route.locator(".route-encounter strong:last-of-type").textContent()
    ).match(/敵\s+(\d+)体/)[1],
  );
  await route.click();
  const started = Date.now(),
    charges = [],
    inputs = [],
    clocks = [],
    held = new Set();
  let pauseEvidence = null;
  let returned = false,
    firing = false;
  async function move(keys) {
    for (const key of [...held])
      if (!keys.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of keys)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
  }
  // Alternate ordinary direction keys by elapsed time. Observe actual light
  // from the public HUD, and stop on the real reward, return or setup screen.
  for (let step = 0; step < 640; step++) {
    const visible = await page.evaluate(() => ({
      reward: !!document.querySelector('[data-action="upgrade"]'),
      ended: !!document.querySelector('[data-action="again"], #seed'),
      status: document.querySelector("#burst-status")?.textContent || "",
      echo: document.querySelector("#echo-status")?.textContent || "",
      next: document.querySelector("#echo-next")?.textContent || "",
      life: document.querySelector("#echo-life-status")?.hidden
        ? ""
        : document.querySelector("#echo-life-status")?.textContent || "",
      urgent: document.querySelector("#echo-life-status")?.dataset.urgent,
      slots: [...document.querySelectorAll(".charge-slot")].map(
        (el) => el.dataset.state,
      ),
    }));
    if (visible.reward) break;
    assert.equal(
      visible.ended,
      false,
      "Stop immediately on actual return or setup; never restart a failed observation",
    );
    const seconds = (Date.now() - started) / 1000;
    if (testEchoStatus && visible.life) {
      assert.match(visible.life, /(?:最短|寿命あと) \d+\.\d秒/);
      clocks.push({ step, seconds, ...visible });
      if (!pauseEvidence) {
        const directions = [...held];
        await move([]);
        await page
          .getByRole("button", { name: "一時停止", exact: true })
          .click();
        await page.waitForTimeout(150);
        const readPaused = () =>
          page.evaluate(() => ({
            next: document.querySelector("#echo-next").textContent,
            life: document.querySelector("#echo-life-status").textContent,
            time: document.querySelector("#run-time").textContent,
            saved: localStorage.getItem("echo-loom.save.v1"),
          }));
        const before = await readPaused();
        await page.waitForTimeout(400);
        const after = await readPaused();
        assert.deepEqual(after, before);
        pauseEvidence = { before, after, durationMs: 400 };
        await page
          .getByRole("button", { name: "航路へ戻る", exact: true })
          .click();
        // Opening a dialog clears game input. Re-enter the intended ordinary
        // keys instead of assuming the pre-pause physical hold was restored.
        await move(directions);
        await page.waitForFunction(
          () => document.querySelector("#echo-life-status")?.hidden === false,
        );
        await page.screenshot({
          path: `${destination}/counter-offline-${outputArtifact}-clock.png`,
        });
      }
    }
    const angle = Math.atan2(
      156 + Math.sin(seconds * 0.6) * 91 - 235,
      Math.cos(seconds * 0.6) * 152,
    );
    const wanted = [];
    if (Math.cos(angle) > 0.25) wanted.push("KeyD");
    if (Math.cos(angle) < -0.25) wanted.push("KeyA");
    if (Math.sin(angle) > 0.25) wanted.push("KeyS");
    if (Math.sin(angle) < -0.25) wanted.push("KeyW");
    await move(wanted);
    if (step % 8 === 4) await page.keyboard.press("KeyQ");
    if (step % 16 === 8) await page.keyboard.press("Space");
    if (!firing && seconds > 20) {
      await page.keyboard.down("KeyJ");
      firing = true;
    }
    if (step % 16 === 0)
      inputs.push({ step, seconds, keys: wanted, status: visible.status });
    const status = visible.status;
    const stock = Number(status.match(/蓄え(\d+)/)?.[1] || 0);
    if (stock > 0) {
      charges.push({ step, stock, status });
      if (!returned)
        await page.screenshot({
          path: `${destination}/counter-offline-${outputArtifact}-stock.png`,
        });
      await page.keyboard.press("KeyR");
      if (!firing) {
        await page.keyboard.down("KeyJ");
        firing = true;
      }
      returned = true;
    }
    await page.waitForTimeout(125);
  }
  await move([]);
  await page.keyboard.up("KeyJ");
  assert.ok(
    returned && charges.length > 0,
    "Capture real enemy bullets and release them through ordinary keys offline",
  );
  if (testEchoStatus) {
    assert.ok(clocks.length > 0 && pauseEvidence);
    if (initial.upgrades.double >= 2)
      assert.ok(
        clocks.some(
          (c) => /READY · [12]\/3/.test(c.echo) && c.next.startsWith("次の1回"),
        ),
        "Observe next refill while a real reserve remains usable",
      );
  }
  const awarded = page.locator(
    `[data-action="upgrade"][data-id="${promised}"]`,
  );
  await awarded.waitFor();
  await awarded.click();
  const completed = await saved();
  assert.equal(completed.checkpoint, "cleared");
  assert.equal(completed.stage, initial.stage + 1);
  assert.ok(completed.threadReturns > initial.threadReturns);
  assert.ok(completed.threadCuts > initial.threadCuts);
  assert.equal(completed.kills - initial.kills, expectedEnemies);
  await page.getByRole("button", { name: "織片を確認", exact: true }).click();
  await page.screenshot({
    path: `${destination}/counter-offline-${outputArtifact}-returned.png`,
  });
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  const restored = await saved();
  assert.deepEqual({ ...restored, time: completed.time }, completed);
  await page.reload();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const backup = await readFile(await (await download).path());
  const exported = prepareImport(backup.toString()).profile.run;
  assert.deepEqual({ ...exported, time: completed.time }, completed);
  assert.deepEqual(errors, []);
  const report = {
    environment:
      "Production service-worker cache, offline. Import an unchanged earned checkpoint captured during a native expedition after acquiring counter through actual rewards or purchase. Ordinary next-room combat, real incoming enemy bullets, native Q and R; no development hooks or projectile/health/clock/world edits. Count means launched needles, not damage prevented or guaranteed hits. This isolated room does not establish human enjoyment or whole-expedition difficulty.",
    sourceArtifact,
    purchases,
    assetFiles,
    initial,
    promised,
    expectedEnemies,
    charges,
    inputs,
    echoStatus: testEchoStatus ? { clocks, pauseEvidence } : null,
    completed,
    restored,
    exported,
    wallSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    errors,
  };
  await writeFile(
    `${destination}/counter-offline-${outputArtifact}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      outcome: "pass",
      stage: completed.stage,
      captured: completed.threadCuts - initial.threadCuts,
      returned: completed.threadReturns - initial.threadReturns,
      hp: completed.hp,
      kills: expectedEnemies,
      assetFiles,
      clockSamples: clocks.length,
      errors,
    }),
  );
} catch (error) {
  const failure = {
    scope:
      "Actual earned checkpoint, public production UI offline; the observation failed before a passing report. Preserve public screen, stored checkpoint and trace for diagnosis. No development hooks or world edits.",
    error: error.stack || String(error),
    screen: page
      ? await page
          .evaluate(() => ({
            text: document.body.innerText,
            saved: JSON.parse(localStorage.getItem("echo-loom.save.v1")),
            diagnostics: typeof window.__ECHO_LOOM__,
          }))
          .catch(() => null)
      : null,
  };
  if (page)
    await page
      .screenshot({
        path: `${destination}/counter-production-failure${tag ? `-${tag}` : ""}.png`,
      })
      .catch(() => {});
  if (context)
    await context.tracing
      .stop({
        path: `${destination}/counter-production-failure${tag ? `-${tag}` : ""}-trace.zip`,
      })
      .catch(() => {});
  await writeFile(
    `${destination}/counter-production-failure${tag ? `-${tag}` : ""}.json`,
    JSON.stringify(failure, null, 2) + "\n",
  );
  throw error;
} finally {
  await browser.close();
}
