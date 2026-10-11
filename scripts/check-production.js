import { productionURL } from "./browser-url.js";
import { observationDirectory } from "./observation-files.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRun } from "../src/game.js";
import { observeUpgradeComparisons } from "./upgrade-observation.js";
const destination = observationDirectory;
const tag = process.argv.find((arg) => arg.startsWith("--tag="))?.slice(6);
if (tag && !/^[a-z0-9-]+$/.test(tag))
  throw new Error("Expected a simple artifact tag");
const suffix = tag ? `-${tag}` : "";
const testReroll = process.argv.includes("--reroll");
const testPreviews = process.argv.includes("--preview");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(),
  page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const NativeAudioContext = window.AudioContext;
  window.__testAudio = { contexts: [], oscillators: 0 };
  window.AudioContext = class extends NativeAudioContext {
    constructor(options) {
      super({ ...options, sinkId: { type: "none" } });
      window.__testAudio.contexts.push(this);
    }
    createOscillator() {
      window.__testAudio.oscillators++;
      return super.createOscillator();
    }
  };
});
await page.goto(productionURL);
await page.waitForFunction(
  () => navigator.serviceWorker.controller !== null,
  {},
  { timeout: 15000 },
);
assert.equal(
  await page.evaluate(() => typeof window.__ECHO_LOOM__),
  "undefined",
);
await context.setOffline(true);
await page.reload();
const assetFiles = await page.evaluate(() =>
  [...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(
    (el) => (el.src || el.href).split("/").at(-1),
  ),
);
const beforePractice = await page.evaluate(() =>
  localStorage.getItem("echo-loom.save.v1"),
);
await page.getByRole("button", { name: "灯りの練習", exact: true }).click();
await page.keyboard.down("KeyA");
await page.waitForFunction(() =>
  document.querySelector("#practice-title")?.textContent.includes("影を撃つ"),
);
await page.keyboard.up("KeyA");
await page.keyboard.down("KeyJ");
await page.waitForFunction(() =>
  document
    .querySelector("#practice-title")
    ?.textContent.includes("一歩をすり抜ける"),
);
await page.keyboard.up("KeyJ");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "練習を終える" }).click();
assert.equal(
  await page.evaluate(() => localStorage.getItem("echo-loom.save.v1")),
  beforePractice,
);
await page.getByRole("button", { name: "灯りをともす" }).click();
await page.getByRole("button", { name: "この灯りで出発する" }).click();
await page.getByRole("button", { name: "最初のひと針へ" }).click();
await page.keyboard.down("KeyJ");
await page.keyboard.down("KeyD");
await page.waitForTimeout(900);
await page.keyboard.up("KeyD");
await page.keyboard.press("KeyQ");
await page.screenshot({
  path: `${destination}/offline${suffix}.png`,
});
assert.deepEqual(errors, []);
const playedBefore = await page.locator("#run-time").textContent();
const audioBefore = await page.evaluate(() => ({
  state: window.__testAudio.contexts[0]?.state,
  time: window.__testAudio.contexts[0]?.currentTime,
  oscillators: window.__testAudio.oscillators,
}));
assert.equal(audioBefore.state, "running");
assert.ok(audioBefore.oscillators > 0);
const frameTimes = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let previous = 0;
      const times = [];
      function sample(now) {
        if (previous) times.push(now - previous);
        previous = now;
        if (times.length < 120) requestAnimationFrame(sample);
        else resolve(times.sort((a, b) => a - b));
      }
      requestAnimationFrame(sample);
    }),
);
console.log(
  JSON.stringify({
    frameMedianMs: frameTimes[60],
    frameP95Ms: frameTimes[114],
    frameMaxMs: frameTimes.at(-1),
  }),
);
assert.notEqual(await page.locator("#run-time").textContent(), playedBefore);
const audioAfter = await page.evaluate(() => ({
  time: window.__testAudio.contexts[0]?.currentTime,
  oscillators: window.__testAudio.oscillators,
}));
assert.ok(audioAfter.time > audioBefore.time + 1);
assert.ok(audioAfter.oscillators > audioBefore.oscillators);
await page.keyboard.up("KeyJ");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "設定", exact: true }).click();
const exported = page.waitForEvent("download");
await page.getByRole("button", { name: "記録を書き出す", exact: true }).click();
const download = await exported;
const backup = await readFile(await download.path());
const record = JSON.parse(backup.toString());
assert.equal(record.format, "echo-loom.backup");
assert.equal(record.profile.attempts, 1);
assert.equal(record.profile.run.stage, 0);
await page.getByRole("button", { name: "設定を閉じる" }).click();
await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
await page.getByRole("button", { name: "設定", exact: true }).click();
await page.locator("#save-file").setInputFiles({
  name: "echo-loom-offline.json",
  mimeType: "application/json",
  buffer: backup,
});
await page.getByRole("button", { name: "記録を取り込む", exact: true }).click();
await page.getByRole("button", { name: "航路を続ける" }).click();
assert.deepEqual(errors, []);
// Import a completed-room fixture through the public backup UI. The next room
// is then fought with ordinary keys, without development diagnostics or state edits.
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
await page.getByRole("button", { name: "設定", exact: true }).click();
const routeRecord = structuredClone(record);
routeRecord.profile.run = createRun("OFFLINE-ROUTE");
routeRecord.profile.run.checkpoint = "cleared";
await page.locator("#save-file").setInputFiles({
  name: "completed-room-fixture.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(routeRecord)),
});
await page.getByRole("button", { name: "記録を取り込む", exact: true }).click();
await page.getByRole("button", { name: "航路を続ける" }).click();
await page.keyboard.down("KeyW");
await page.waitForTimeout(2300);
await page.keyboard.up("KeyW");
await page.keyboard.press("KeyE");
const loom = page.locator('[data-action="route"][data-id="loom"]');
await loom.waitFor();
const promised = await loom.getAttribute("data-promised");
assert.ok(promised);
const expectedEnemies = Number(
  (
    await loom.locator(".route-encounter strong:last-of-type").textContent()
  ).match(/敵\s+(\d+)体/)[1],
);
await loom.click();
const routeStarted = Date.now();
await page.keyboard.down("KeyJ");
let moving = null;
for (let step = 0; step < 120; step++) {
  if (await page.locator('[data-action="upgrade"]').count()) break;
  assert.equal(
    await page.locator('[data-action="again"]').count(),
    0,
    "Survive the real room",
  );
  const next = ["KeyD", "KeyW", "KeyA", "KeyS"][Math.floor(step / 2) % 4];
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
const awarded = page.locator(`[data-action="upgrade"][data-id="${promised}"]`);
await awarded.waitFor();
assert.equal(await page.locator('[data-action="upgrade"]').count(), 3);
assert.ok((await awarded.getAttribute("class")).includes("promised"));
let rerollEvidence = null;
const upgradePreviews = testPreviews
  ? { earned: await observeUpgradeComparisons(page) }
  : null;
if (testReroll) {
  const pending = await page.evaluate(
    () => JSON.parse(localStorage.getItem("echo-loom.save.v1")).run,
  );
  const initialOffers = await page
    .locator('[data-action="upgrade"]')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
  const reroll = page.locator('[data-action="rerollreward"]');
  assert.ok(
    await reroll.isEnabled(),
    "Earn enough scrap in ordinary combat to pay for a reroll",
  );
  await reroll.click();
  const rolled = await page.evaluate(
    () => JSON.parse(localStorage.getItem("echo-loom.save.v1")).run,
  );
  const changedOffers = await page
    .locator('[data-action="upgrade"]')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
  assert.equal(rolled.checkpoint, "reward");
  assert.equal(rolled.rewardRoll, 1);
  assert.equal(rolled.scrap, pending.scrap - 12);
  assert.ok(changedOffers.includes(promised));
  assert.ok(changedOffers.some((id) => !initialOffers.includes(id)));
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await awarded.waitFor();
  assert.deepEqual(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("echo-loom.save.v1")).run,
    ),
    rolled,
  );
  assert.deepEqual(
    await page
      .locator('[data-action="upgrade"]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.id)),
    changedOffers,
  );
  rerollEvidence = {
    cost: 12,
    scrapBefore: pending.scrap,
    scrapAfter: rolled.scrap,
    initialOffers,
    changedOffers,
    promised,
    pendingRestoredOffline: true,
  };
  if (testPreviews)
    upgradePreviews.rerolled = await observeUpgradeComparisons(page);
}
await page.screenshot({
  path: `${destination}/route-offline${suffix}-reward.png`,
});
await awarded.click();
const routeRun = await page.evaluate(
  () => JSON.parse(localStorage.getItem("echo-loom.save.v1")).run,
);
assert.equal(routeRun.stage, 1);
assert.equal(routeRun.checkpoint, "cleared");
assert.equal(routeRun.upgrades[promised], 1);
assert.equal(routeRun.kills, expectedEnemies);
assert.ok(routeRun.time > 0 && routeRun.hp > 0);
assert.equal(
  await page.evaluate(() => typeof window.__ECHO_LOOM__),
  "undefined",
);
await writeFile(
  `${destination}/route-offline${suffix}.json`,
  JSON.stringify(
    {
      environment:
        "Production service-worker cache, offline network, completed first-room backup fixture imported through the public UI; native keyboard battle in the next room, no debug hooks or combat/health/clock edits. Native silent audio output. This does not represent a whole expedition or human enjoyment.",
      wallSeconds: Number(((Date.now() - routeStarted) / 1000).toFixed(1)),
      assetFiles,
      frameTimes: {
        median: frameTimes[60],
        p95: frameTimes[114],
        max: frameTimes.at(-1),
      },
      audioBefore,
      audioAfter,
      promised,
      rerollEvidence,
      upgradePreviews,
      expectedEnemies,
      run: routeRun,
      errors,
    },
    null,
    2,
  ) + "\n",
);
await page.reload();
await page.getByRole("button", { name: "航路を続ける" }).click();
assert.equal(await page.locator('[data-action="upgrade"]').count(), 0);
const restoredRoute = await page.evaluate(
  () => JSON.parse(localStorage.getItem("echo-loom.save.v1")).run,
);
assert.ok(
  restoredRoute.time >= routeRun.time && restoredRoute.time < routeRun.time + 3,
);
assert.deepEqual(
  { ...restoredRoute, time: routeRun.time },
  routeRun,
  "Reload preserves the earned fragment and settled room without awarding again",
);
assert.deepEqual(errors, []);
console.log(
  "PASS: production assets, development diagnostics absent, offline reload and practice without changing saves, advancing expedition and native audio clock with silent output, echo input, offline save export/import/resume; advertised fragment earned through native keyboard combat offline and retained after reload.",
);
await browser.close();
