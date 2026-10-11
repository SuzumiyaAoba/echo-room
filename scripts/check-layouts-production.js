import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { SAVE_KEY, prepareImport } from "../src/save.js";
import { Game } from "../src/game.js";
import { Game as Before } from "../tests/fixtures/layouts-v1/game.js";

const earnedPath =
  process.argv[2] ||
  ".mdxr/20261007195700-echo-loom/assets/layouts-earned-layouts-v2-final.json";
const earnedText = await readFile(earnedPath, "utf8"),
  earned = prepareImport(earnedText).profile;
assert.equal(earned.run.layoutVersion, 2);
assert.equal(earned.run.stage, 8);
assert.equal(earned.run.checkpoint, "entry");
const planned = new Game(structuredClone(earned.run));
const previous = new Before({
  ...structuredClone(earned.run),
  layoutVersion: 1,
});

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
    `/tmp/echo-layouts-offline-${kind}.png`,
    Buffer.from(png.split(",")[1], "base64"),
  );
  return { milliseconds: 350, exact: true, before, after };
}
try {
  await page.goto("http://127.0.0.1:4173/");
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
  await page.locator("#save-file").setInputFiles({
    name: "earned-layouts.json",
    mimeType: "application/json",
    buffer: Buffer.from(earnedText),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
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
  await page.screenshot({ path: "/tmp/echo-layouts-offline-settings.png" });
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const initial = await pause("entry");
  const samples = [];
  for (let y = 1; y < 16; y++)
    for (let x = 1; x < 27; x++) {
      if (planned.tiles[y][x] === 2) samples.push({ x, y, solid: true });
      else if (planned.tiles[y][x] === 0 && previous.tiles[y][x] === 2)
        samples.push({ x, y, solid: false });
    }
  const terrain = await page.locator("#world").evaluate((canvas, samples) => {
    const c = canvas.getContext("2d");
    return samples.map((p) => ({
      ...p,
      rgba: [
        ...c.getImageData(
          (16 + p.x * 16 + 12) * 2,
          (16 + p.y * 16 + 12) * 2,
          1,
          1,
        ).data,
      ],
    }));
  }, samples);
  assert.ok(terrain.filter((p) => p.solid).length >= 12);
  assert.ok(terrain.filter((p) => !p.solid).length > 0);
  for (const p of terrain) {
    if (p.solid)
      assert.deepEqual(
        p.rgba,
        [62, 72, 71, 255],
        `Actual regional cover at ${p.x},${p.y}`,
      );
    else
      assert.notDeepEqual(
        p.rgba,
        [62, 72, 71, 255],
        `Former cover was removed at ${p.x},${p.y}`,
      );
  }
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
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
      path: `/tmp/echo-layouts-offline-${viewport.width}x${viewport.height}.png`,
    });
  }
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const saved = JSON.parse(await readSave());
  assert.equal(saved.run.seed, earned.run.seed);
  assert.equal(saved.run.stage, earned.run.stage);
  assert.equal(saved.run.layoutVersion, 2);
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
  await download.saveAs("/tmp/echo-layouts-offline-export.json");
  const exported = prepareImport(
    await readFile("/tmp/echo-layouts-offline-export.json", "utf8"),
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
    "/tmp/echo-layouts-offline.json",
    JSON.stringify(
      {
        scope:
          "Public native Chromium production UI, actual recording route/seconds before Q, keyboard movement/fire and touchscreen Q/R taps; unchanged earned stage-8 v2 entry imported through the public file UI, offline reload after current six assets warm. Pixel samples at every regional cover cell and former-only cover cells verify the actual production geometry against the planned collision map; no development hooks. No development hooks or actor/HP/history/RNG/clock preparation. Exact public HUD/RGBA/save for 350ms pauses, three paused sizes, public export and entry reload; this helper is not a full expedition, physical touchscreen or listening evaluation; the linked earned checkpoint comes from a separate actual fresh native journey.",
        cache,
        earnedPath,
        earnedRun: earned.run,
        initial,
        terrain,
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
    "/tmp/echo-layouts-offline-failure.json",
    JSON.stringify({ error: String(error), errors }, null, 2) + "\n",
  );
  await page
    .screenshot({ path: "/tmp/echo-layouts-offline-failure.png" })
    .catch(() => {});
  await context.tracing
    .stop({ path: "/tmp/echo-layouts-offline-failure-trace.zip" })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
