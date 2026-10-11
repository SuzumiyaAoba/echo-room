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

const artifact = process.argv[2] || "needle-stitch-weaving";
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
  viewport: { width: 360, height: 640 },
  hasTouch: true,
  isMobile: true,
});
await context.tracing.start({ snapshots: true, sources: true });
const page = await context.newPage();
const errors = [],
  observations = [],
  inputs = [],
  held = new Set(),
  layoutEvidence = [],
  touchEvidence = [];
page.on("pageerror", (e) => errors.push(e.message));
let pauseEvidence = null,
  defeatPauseEvidence = null;
const canvasHash = () =>
  page.evaluate(async () => {
    const canvas = document.querySelector("#world");
    const bytes = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  });
const saved = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const visible = () =>
  page.evaluate(() => ({
    state: document.querySelector("#boss-ward")?.dataset.state,
    bossFillWidth: document.querySelector("#boss-fill")?.style.width,
    bossVisible: !document.querySelector("#bossbar")?.hidden,
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
async function readLayout() {
  return page.evaluate(() => {
    const selectors = [
      "#health-number",
      ".hud-location",
      ".hud-location small",
      ".hud-wallet",
      "#dash-status",
      "#echo-status",
      "#echo-next",
      "#burst-status",
      "#echo-life-status",
      "#boss-name",
      "#boss-phase",
      "#boss-intent",
      "#boss-ward-state",
      "#boss-countdown",
    ];
    const fields = selectors.map((selector) => {
      const el = document.querySelector(selector),
        style = getComputedStyle(el),
        box = el.getBoundingClientRect(),
        parent = el.parentElement.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      return {
        selector,
        text: el.textContent,
        font: parseFloat(style.fontSize),
        visible: !!el.getClientRects().length,
        inside:
          box.x >= -0.5 &&
          box.y >= -0.5 &&
          box.right <= innerWidth + 0.5 &&
          box.bottom <= innerHeight + 0.5,
        overflow:
          style.display === "inline"
            ? text.x < parent.x - 1 || text.right > parent.right + 1
            : el.scrollWidth > el.clientWidth + 1,
      };
    });
    const buttons = [
      ...document.querySelectorAll(".hud button,[data-touch-key],[data-stick]"),
    ].map((el) => {
      const box = el.getBoundingClientRect(),
        top = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
      return {
        label: el.getAttribute("aria-label") || el.textContent,
        width: box.width,
        height: box.height,
        hit: top === el || el.contains(top),
      };
    });
    const world = document.querySelector("#world").getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      fields,
      buttons,
      canvasRatio: world.width / world.height,
    };
  });
}
async function checkLayout() {
  const evidence = await readLayout();
  layoutEvidence.push(evidence);
  assert.ok(Math.abs(evidence.canvasRatio - 1.6) < 0.001);
  for (const field of evidence.fields) {
    assert.ok(field.font >= 10, `${field.selector}: font`);
    if (field.visible)
      assert.ok(field.inside && !field.overflow, `${field.selector}: bounds`);
  }
  for (const button of evidence.buttons)
    assert.ok(
      button.width >= 40 && button.height >= 40 && button.hit,
      `${button.label}: touch target`,
    );
  return evidence;
}
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
  const cacheEvidence = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) =>
      name.startsWith("echo-loom-"),
    );
    return Promise.all(
      names.map(async (name) => ({
        name,
        urls: (await (await caches.open(name)).keys()).map(
          (request) => request.url,
        ),
      })),
    );
  });
  assert.equal(cacheEvidence.length, 1);
  assert.equal(cacheEvidence[0].urls.length, 6);
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
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-flashes").uncheck();
  await page.locator("#setting-autoAim").check();
  await page.locator(".keyboard-settings summary").click();
  for (const [action, code] of [
    ["fire", "KeyF"],
    ["up", "KeyI"],
    ["down", "KeyK"],
    ["left", "KeyJ"],
    ["right", "KeyL"],
    ["dash", "KeyV"],
    ["echo", "KeyC"],
    ["burst", "KeyB"],
    ["interact", "KeyN"],
  ]) {
    await page
      .locator(`[data-action="bindkey"][data-id="${action}"][data-slot="0"]`)
      .click();
    await page.keyboard.press(code);
  }
  const configured = (await saved()).settings;
  assert.deepEqual(configured.keybindings, {
    up: ["KeyI", "ArrowUp"],
    down: ["KeyK", "ArrowDown"],
    left: ["KeyJ", "ArrowLeft"],
    right: ["KeyL", "ArrowRight"],
    fire: ["KeyF", "KeyZ"],
    dash: ["KeyV", "Shift"],
    echo: ["KeyC", null],
    burst: ["KeyB", null],
    interact: ["KeyN", null],
  });
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.locator('[data-action="continue"]').click();
  assert.deepEqual((await saved()).run, initial.run);
  const started = Date.now();
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 640, height: 360 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(500);
    await page.locator('[data-touch-key="KeyQ"]').tap();
    await page.waitForFunction(
      () => !document.querySelector("#echo-life-status").hidden,
    );
    await checkLayout();
    await page.screenshot({
      path: `${destination}/keybindings-offline-${viewport.width}x${viewport.height}.png`,
    });
    await page.getByRole("button", { name: "一時停止", exact: true }).tap();
    await page.waitForTimeout(150);
    const before = {
      ui: await visible(),
      saved: await saved(),
      canvasSha256: await canvasHash(),
    };
    await page.waitForTimeout(400);
    const after = {
      ui: await visible(),
      saved: await saved(),
      canvasSha256: await canvasHash(),
    };
    assert.deepEqual(after, before);
    touchEvidence.push({
      viewport,
      echoAppeared: true,
      pauseUnchanged: true,
      before,
      after,
    });
    await page.getByRole("button", { name: "航路へ戻る", exact: true }).tap();
    await page.locator('[data-touch-key="KeyR"]').tap();
    await page.waitForFunction(
      () => document.querySelector("#echo-life-status").hidden,
    );
    touchEvidence.at(-1).releaseClearedEchoes = true;
  }

  let final,
    sawBoss = false;
  const warningEvidence = [];
  // Follow a regular orbit with native direction keys and public HUD readings.
  // No simulation hooks, enemy positions, health, history or clocks are edited.
  for (let step = 0; step < 960; step++) {
    const v = await visible(),
      seconds = (Date.now() - started) / 1000;
    if (
      v.telegraphVisible &&
      v.intent?.includes("昨日の断層") &&
      warningEvidence.length === 0
    ) {
      const before = await visible();
      await page.screenshot({
        path: `${destination}/keybindings-offline-fault.png`,
      });
      warningEvidence.push({
        before,
        after: await visible(),
        layout: await checkLayout(),
        note: "Actual final-room fault warning, normal clock continues during screenshot; public HUD only.",
      });
    }
    if (v.bossVisible) sawBoss = true;
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
          path: `${destination}/keybindings-offline-${v.state}.png`,
        });
    }
    if (v.state === "open" && !pauseEvidence) {
      await keys([]);
      await page.getByRole("button", { name: "一時停止", exact: true }).click();
      await page.waitForTimeout(150);
      const before = {
        ui: await visible(),
        saved: await saved(),
        canvasSha256: await canvasHash(),
      };
      await page.waitForTimeout(400);
      const after = {
        ui: await visible(),
        saved: await saved(),
        canvasSha256: await canvasHash(),
      };
      assert.deepEqual(after, before);
      pauseEvidence = { before, after, durationMs: 400 };
      await page
        .getByRole("button", { name: "航路へ戻る", exact: true })
        .click();
    }
    if (sawBoss && !v.bossVisible && !defeatPauseEvidence) {
      await keys([]);
      await page.getByRole("button", { name: "一時停止", exact: true }).click();
      await page.waitForTimeout(150);
      const before = {
        ui: await visible(),
        saved: await saved(),
        canvasSha256: await canvasHash(),
      };
      assert.equal(before.ui.bossVisible, false);
      assert.equal(before.ui.ended, false);
      await page.waitForTimeout(400);
      const after = {
        ui: await visible(),
        saved: await saved(),
        canvasSha256: await canvasHash(),
      };
      assert.deepEqual(after, before);
      const world = await page.evaluate(() =>
        document.querySelector("#world").toDataURL(),
      );
      await writeFile(
        `${destination}/keybindings-offline-collapse.png`,
        Buffer.from(world.split(",")[1], "base64"),
      );
      defeatPauseEvidence = {
        before,
        after,
        durationMs: 400,
        publicBossRowClosed: true,
        observedBeforeVictory: true,
      };
      await page
        .getByRole("button", { name: "航路へ戻る", exact: true })
        .click();
    }
    const angle = seconds * 0.6;
    const wanted = ["KeyF"];
    if (Math.cos(angle) > 0.25) wanted.push("KeyL");
    if (Math.cos(angle) < -0.25) wanted.push("KeyJ");
    if (Math.sin(angle) > 0.25) wanted.push("KeyK");
    if (Math.sin(angle) < -0.25) wanted.push("KeyI");
    await keys(wanted);
    if (step % 8 === 4) await page.keyboard.press("KeyC");
    if (step % 16 === 8) await page.keyboard.press("KeyV");
    if (step % 16 === 0 && ["closed", "weaving"].includes(v.state))
      await page.keyboard.press("KeyB");
    if (step % 8 === 0) inputs.push({ step, seconds, keys: wanted, ...v });
    await page.waitForTimeout(125);
  }
  await keys([]);
  const completed = await saved();
  const report = {
    environment:
      "Production service-worker cache, offline; import the unchanged entry earned by an actual 24-room native expedition. Public no-flashes/auto-aim settings; portrait touch Q/R and pause with exact world-pixel hashes over 400ms, landscape rotation, font/bounds/target checks, then a native remapped IJKL/F/V/C/B keyboard pilot using public DOM HUD and the actual boss-row disappearance before victory and stitch count only, nine public key mappings saved and preserved at victory and reload, no-flashes invulnerability body, native silent audio; no development hooks or combat/history/health/clock changes. This is automated evidence, not a human enjoyment evaluation.",
    sourceArtifact,
    sourceSha256: createHash("sha256").update(record).digest("hex"),
    assetFiles,
    cacheEvidence,
    initial,
    configured,
    layoutEvidence,
    touchEvidence,
    observations,
    inputs,
    pauseEvidence,
    defeatPauseEvidence,
    warningEvidence,
    completed,
    final,
    wallSeconds: (Date.now() - started) / 1000,
    errors,
  };
  await writeFile(
    `${destination}/keybindings-offline.json`,
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
  assert.deepEqual(completed.settings, configured);
  assert.ok(
    observations.some((o) => o.state === "open") && pauseEvidence,
    "Open and pause the actual ward offline",
  );

  assert.ok(
    defeatPauseEvidence,
    "Observe and pause the closed boss row before victory, offline",
  );

  const completedStitches = Number(
    final.body.match(/合わせ縫い (\d+)/)?.[1] || 0,
  );
  assert.ok(
    completedStitches > initial.run.needleStitches,
    "Complete new stitches during the actual offline final fight",
  );
  report.completedStitches = completedStitches;
  report.initialStitches = initial.run.needleStitches;
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: `${destination}/keybindings-offline-victory.png`,
  });
  await page.reload();
  assert.deepEqual(
    await saved(),
    completed,
    "Keep the actual victory after an offline reload",
  );
  await writeFile(
    `${destination}/keybindings-offline.json`,
    JSON.stringify({ ...report, reloadPreserved: true }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      outcome: "pass",
      openings: observations.filter((o) => o.state === "open").length,
      layouts: layoutEvidence.length,
      touchChecks: touchEvidence.length,
      wallSeconds: report.wallSeconds,
      victories: completed.victories,
      assetFiles,
      errors,
    }),
  );
} catch (error) {
  await page
    .screenshot({ path: `${destination}/keybindings-offline-failure.png` })
    .catch(() => {});
  await context.tracing
    .stop({ path: `${destination}/keybindings-offline-failure-trace.zip` })
    .catch(() => {});
  await writeFile(
    `${destination}/keybindings-offline-failure.json`,
    JSON.stringify(
      {
        error: error.stack,
        visible: await visible().catch(() => null),
        saved: await saved().catch(() => null),
        layoutEvidence,
        touchEvidence,
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
