import { productionURL } from "./browser-url.js";
import { observationPath } from "./observation-files.js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { SAVE_KEY, prepareImport } from "../src/save.js";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 640, height: 360 },
  hasTouch: true,
});
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
const errors = [],
  layouts = [],
  targets = [];
page.on("pageerror", (error) => errors.push(error.message));
const readSave = () =>
  page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
const nextDraw = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
async function read() {
  return page.evaluate(async (key) => {
    const c = document.querySelector("#world");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    return {
      pixels: [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      save: localStorage.getItem(key),
      hud: [
        "run-time",
        "echo-status",
        "echo-next",
        "echo-life-status",
        "burst-status",
      ].map((id) => {
        const el = document.getElementById(id);
        return { id, text: el.textContent, hidden: el.hidden };
      }),
    };
  }, SAVE_KEY);
}
async function pause(kind) {
  await page.locator('[data-action="pause"]').click();
  await nextDraw();
  // Let the public HUD catch the final simulation frame, which is now stopped.
  await page.waitForTimeout(120);
  const before = await read();
  await page.waitForTimeout(350);
  const after = await read();
  assert.deepEqual(after, before);
  const png = await page.locator("#world").evaluate((c) => c.toDataURL());
  await writeFile(
    observationPath(`echo-recording-offline-${kind}.png`),
    Buffer.from(png.split(",")[1], "base64"),
  );
  return { milliseconds: 350, exact: true, before, after };
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
  const sw = await readFile("dist/sw.js", "utf8");
  assert.ok(cache.names.length === 1 && sw.includes(cache.names[0]));
  await context.setOffline(true);
  await page.reload();
  assert.equal(
    await page.evaluate(() => typeof window.__ECHO_LOOM__),
    "undefined",
  );
  await page.getByRole("button", { name: "設定", exact: true }).click();
  for (const [id, checked] of [
    ["flashes", false],
    ["shake", false],
    ["autoAim", true],
  ]) {
    const input = page.locator(`#setting-${id}`);
    await input[checked ? "check" : "uncheck"]();
    const target = await input.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        hit:
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
          el,
        checked: el.checked,
      };
    });
    assert.deepEqual(target, { width: 40, height: 40, hit: true, checked });
    targets.push({ id, ...target });
  }
  await page.screenshot({
    path: observationPath("echo-recording-offline-settings.png"),
  });
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("RECORDING-OFFLINE");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.getByRole("button", { name: "最初のひと針へ" }).click();
  await page.keyboard.down("KeyJ");
  for (const key of ["KeyD", "KeyW", "KeyA"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(350);
    await page.keyboard.up(key);
  }
  await page.keyboard.up("KeyJ");
  const recording = await pause("route");
  assert.match(
    recording.before.hud.find((x) => x.id === "echo-next").text,
    /^録画 \d\.\d秒$/,
  );
  assert.match(
    recording.before.hud.find((x) => x.id === "echo-status").text,
    /^READY/,
  );
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.locator('[data-touch-action="echo"]').tap();
  await page.waitForFunction(
    () => !document.querySelector("#echo-life-status").hidden,
  );
  const arrival = await pause("arrival");
  assert.equal(
    arrival.before.hud.find((x) => x.id === "echo-life-status").hidden,
    false,
  );
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('[data-touch-action="burst"]').tap();
  await page.waitForFunction(
    () => document.querySelector("#echo-life-status").hidden,
  );
  const release = await pause("release");
  assert.equal(
    release.before.hud.find((x) => x.id === "burst-status").text,
    "残響をほどく",
  );
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 640, height: 360 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await nextDraw();
    const box = await page.locator("#world").boundingBox();
    assert.ok(Math.abs(box.width / box.height - 1.6) < 0.0001);
    assert.deepEqual(await read(), release.before);
    layouts.push({ viewport, ratio: box.width / box.height, exact: true });
    await page.screenshot({
      path: observationPath(
        `echo-recording-offline-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const saved = JSON.parse(await readSave());
  assert.equal(saved.run.seed, "RECORDING-OFFLINE");
  assert.equal(saved.run.checkpoint, "entry");
  assert.equal(saved.settings.flashes, false);
  assert.equal(saved.settings.shake, false);
  assert.equal(saved.settings.autoAim, true);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs(observationPath("echo-recording-offline-export.json"));
  const exported = prepareImport(
    await readFile(
      observationPath("echo-recording-offline-export.json"),
      "utf8",
    ),
  ).profile;
  assert.deepEqual(exported, prepareImport(JSON.stringify(saved)).profile);
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.reload();
  assert.deepEqual(JSON.parse(await readSave()), saved);
  assert.equal(
    await page.evaluate(() => typeof window.__ECHO_LOOM__),
    "undefined",
  );
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const reloaded = await pause("reloaded");
  assert.equal(
    reloaded.before.hud.find((x) => x.id === "echo-life-status").hidden,
    true,
  );
  assert.deepEqual(JSON.parse(reloaded.before.save), saved);
  assert.deepEqual(errors, []);
  await writeFile(
    observationPath("echo-recording-offline.json"),
    JSON.stringify(
      {
        scope:
          "Public native Chromium production UI, actual recording route/seconds before Q, keyboard movement/fire and touchscreen Q/R taps; fresh unprepared expedition, offline reload after current six assets warm. No development hooks or actor/HP/history/RNG/clock preparation. Exact public HUD/RGBA/save for 350ms pauses, three paused sizes, public export and entry reload; not a full expedition, physical touchscreen or listening evaluation.",
        cache,
        recording,
        targets,
        arrival,
        release,
        layouts,
        reloaded,
        exportMatches: true,
        exportComparison:
          "Both exported and saved profiles pass public import validation before comparing all fields.",
        reloadMatches: true,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  await context.tracing.stop();
  console.log(
    JSON.stringify({
      cache,
      targets: targets.length,
      pauses: 3,
      layouts: layouts.length,
      exportMatches: true,
      reloadMatches: true,
      errors,
    }),
  );
} catch (error) {
  await writeFile(
    observationPath("echo-recording-offline-failure.json"),
    JSON.stringify({ error: String(error), errors }, null, 2) + "\n",
  );
  await page
    .screenshot({ path: observationPath("echo-recording-offline-failure.png") })
    .catch(() => {});
  await context.tracing
    .stop({ path: observationPath("echo-recording-offline-failure-trace.zip") })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
