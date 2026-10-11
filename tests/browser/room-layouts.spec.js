import { artifactPath } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { freshProfile, SAVE_KEY, prepareImport } from "../../src/save.js";
import { Game, createRun, forecastRoom } from "../../src/game.js";
import {
  Game as Before,
  createRun as beforeRun,
} from "../fixtures/layouts-v1/game.js";
import { observeLayoutArt } from "../../scripts/observe-layouts.js";

const profileFor = (stage, cleared = true) => {
  const p = freshProfile();
  p.attempts = 2;
  Object.assign(p.settings, { shake: false, flashes: false, autoAim: true });
  p.run = createRun("LAYOUT-NATIVE-ROOM");
  p.run.stage = stage;
  p.run.checkpoint = cleared ? "cleared" : "entry";
  return p;
};
async function begin(page, profile) {
  await page.addInitScript(
    ({ key, profile }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(profile));
    },
    { key: SAVE_KEY, profile },
  );
  await page.goto("/");
}
async function freeze(page) {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  return page.evaluate(async (key) => {
    const g = window.__ECHO_LOOM__.game(),
      c = document.querySelector("#world");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    return {
      game: JSON.stringify(g),
      pixels: [...new Uint8Array(hash)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      save: localStorage.getItem(key),
    };
  }, SAVE_KEY);
}
async function pause(page) {
  await page.locator('[data-action="pause"]').click();
  await page.waitForTimeout(120);
  const before = await freeze(page);
  await page.waitForTimeout(350);
  expect(await freeze(page)).toEqual(before);
  return before;
}
async function toFork(page) {
  const held = new Set();
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const move = await page.evaluate(async () => {
      const g = window.__ECHO_LOOM__.game();
      const { steerToExit } = await import("/scripts/pilot-navigation.js");
      return {
        ...steerToExit(g),
        near: Math.hypot(g.player.x - 240, g.player.y - 43) < 27,
      };
    });
    const next = new Set(
      move.near
        ? []
        : [
            move.mx > 0 ? "KeyD" : move.mx < 0 ? "KeyA" : null,
            move.my > 0 ? "KeyS" : move.my < 0 ? "KeyW" : null,
          ].filter(Boolean),
    );
    for (const key of held) if (!next.has(key)) await page.keyboard.up(key);
    for (const key of next) if (!held.has(key)) await page.keyboard.down(key);
    held.clear();
    next.forEach((key) => held.add(key));
    if (move.near) {
      await page.keyboard.press("KeyE");
      await expect(page.locator('[data-action="route"]')).toHaveCount(3);
      return;
    }
    await page.waitForTimeout(125);
  }
  throw Error("Native movement did not reach the cleared room exit");
}
async function watchEntry(page) {
  await page.evaluate(() => {
    const prior = window.__ECHO_LOOM__.game();
    delete window.__layoutEntry;
    function first() {
      const g = window.__ECHO_LOOM__.game();
      if (g && g !== prior)
        window.__layoutEntry = {
          run: structuredClone(g.run),
          tiles: structuredClone(g.tiles),
          queue: structuredClone(g.spawnQueue),
          player: structuredClone(g.player),
        };
      else requestAnimationFrame(first);
    }
    requestAnimationFrame(first);
  });
}
async function entry(page) {
  await page.waitForFunction(() => Boolean(window.__layoutEntry));
  return page.evaluate(() => window.__layoutEntry);
}
function expected(run, stage, route) {
  return new Game({
    ...structuredClone(run),
    stage,
    route,
    checkpoint: "entry",
  });
}
function verifyEntry(actual, planned) {
  expect(actual.run.layoutVersion).toBe(planned.run.layoutVersion);
  expect(actual.run.stage).toBe(planned.run.stage);
  expect(actual.tiles).toEqual(planned.tiles);
  expect(actual.queue).toEqual(planned.spawnQueue);
}
async function maps(page, run, next) {
  const observed = [];
  for (const route of ["loom", "rest", "salvage"]) {
    const f = forecastRoom(run, next, route),
      card = page.locator(`[data-action="route"][data-id="${route}"]`);
    await expect(card.locator(".route-layout")).toHaveAttribute(
      "data-layout-id",
      f.layout.id,
    );
    await expect(card.locator(".route-layout strong")).toHaveText(
      f.layout.name,
    );
    await expect(card.locator(".route-layout small")).toHaveText(f.layout.hint);
    const tiles = await card.locator(".route-map").evaluate((svg) => {
      const grid = Array.from({ length: 17 }, () => Array(28).fill(0));
      const colors = { "#627c7e": 1, "#b39c74": 2, "#ead49c": 3 };
      for (const path of svg.querySelectorAll("path")) {
        const cells = [
          ...path.getAttribute("d").matchAll(/M(\d+) (\d+)h1v1h-1z/g),
        ];
        for (const [, x, y] of cells)
          grid[Number(y)][Number(x)] = colors[path.getAttribute("fill")];
      }
      return grid;
    });
    expect(tiles).toEqual(f.layout.tiles);
    observed.push({ route, id: f.layout.id, name: f.layout.name, tiles });
  }
  return observed;
}
const proof = async (name, browserName, value) =>
  writeFile(
    artifactPath(`echo-layouts-${name}-${browserName}.json`),
    JSON.stringify(value, null, 2) + "\n",
  );

test("18配置の実画素：旧描画は完全一致し、新描画は遮蔽物の周囲だけを変える", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const result = await observeLayoutArt(page);
  expect(result.rows).toHaveLength(18);
  expect(result.wallApproach.damageTaken).toBeGreaterThan(0);
  expect(result.wallApproach.fullBodyClear && result.wallApproach.rngSame).toBe(
    true,
  );
  expect(
    result.rows.every(
      (r) => r.legacyExact && r.rngSame && r.outside === 0 && r.changed > 0,
    ),
  ).toBe(true);
  for (let i = 0; i < 3; i++)
    await writeFile(
      artifactPath(`echo-layouts-sheet-${browserName}-${i}.png`),
      Buffer.from(result.sheets[i].split(",")[1], "base64"),
    );
  expect(errors).toEqual([]);
  await proof("art", browserName, {
    scope:
      "Controlled native renderers at time zero; 18 full RGBA legacy comparisons, 18 old/new shape comparisons outside cover neighborhoods. Constructor and drawing only; no earned expedition or enjoyment claim.",
    rows: result.rows,
    wallApproach: result.wallApproach,
    errors,
  });
});

test("公開の航路見取図・入室・Q・停止・再開で実際の地域配置を保つ", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const profile = profileFor(8);
  await begin(page, profile);
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await toFork(page);
  const previews = await maps(page, profile.run, 9);
  const planned = expected(profile.run, 9, "loom");
  await page.screenshot({
    path: artifactPath(`echo-layouts-routes-${browserName}.png`),
  });
  await watchEntry(page);
  await page.locator('[data-action="route"][data-id="loom"]').click();
  const arrived = await entry(page);
  verifyEntry(arrived, planned);
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  await page.keyboard.press("KeyQ");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().run.echoesCast))
    .toBeGreaterThan(0);
  const stopped = await pause(page);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  await watchEntry(page);
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const resumed = await entry(page);
  verifyEntry(resumed, planned);
  const again = await pause(page);
  expect(again.save).toBe(stopped.save);
  expect(errors).toEqual([]);
  await proof("route", browserName, {
    scope:
      "Prepared cleared stage-8 checkpoint. Actual keyboard movement reaches exit; three SVG maps independently decoded against collision tiles. First-RAF read observes public route entry, native move/fire/Q, 350ms exact state/RGBA/save pauses and entry reload. No actor/HP/RNG/history/clock mutation after entry; not an earned 24-room journey.",
    previews,
    arrived,
    resumed,
    stopped,
    again,
    errors,
  });
});

test("配置番号のない旧記録を公開取り込みし、旧配置を再開・書き出し・取り消しできる", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const current = profileFor(9, false),
    legacy = freshProfile();
  legacy.attempts = 2;
  legacy.settings = { ...current.settings };
  legacy.run = beforeRun("LEGACY-NATIVE-LAYOUT");
  legacy.run.stage = 9;
  legacy.run.checkpoint = "entry";
  delete legacy.run.layoutVersion;
  const planned = new Before(structuredClone(legacy.run));
  await begin(page, current);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "old-layout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(
    page.getByRole("heading", { name: "この記録を取り込む", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await watchEntry(page);
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const arrived = await entry(page);
  expect(arrived.run.layoutVersion).toBe(1);
  expect(arrived.tiles).toEqual(planned.tiles);
  expect(arrived.queue).toEqual(planned.spawnQueue);
  const stopped = await pause(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const download = await waiting,
    exported = prepareImport(
      await readFile(await download.path(), "utf8"),
    ).profile;
  expect(exported.run.layoutVersion).toBe(1);
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  await watchEntry(page);
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const resumed = await entry(page);
  expect(resumed.tiles).toEqual(planned.tiles);
  expect(resumed.run.layoutVersion).toBe(1);
  await pause(page);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("button", { name: "直前の取り込みを戻す" }).click();
  await page.getByRole("button", { name: "この記録へ戻す" }).click();
  await page.reload();
  await watchEntry(page);
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const undone = await entry(page);
  verifyEntry(undone, new Game(structuredClone(current.run)));
  await pause(page);
  expect(errors).toEqual([]);
  await proof("legacy", browserName, {
    scope:
      "Prepared old entry checkpoint without layoutVersion and prepared current v2 entry checkpoint. Public file import/export/reload/undo, actual original tiles and queues. First-RAF read only, 350ms exact pause. No earned expedition claim.",
    arrived,
    stopped,
    exported,
    resumed,
    undone,
    errors,
  });
});

test("三つのタッチ画面で見取図と説明を読み、図をタップして次の地域へ入る", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const profile = profileFor(16);
    await begin(page, profile);
    await page.getByRole("button", { name: "航路を続ける" }).click();
    await toFork(page);
    const previews = await maps(page, profile.run, 17),
      sizes = [];
    await page.waitForTimeout(120);
    const frozen = await freeze(page);
    for (const [width, height] of [
      [640, 360],
      [390, 844],
      [360, 640],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(350);
      expect(await freeze(page)).toEqual(frozen);
      const card = page.locator('[data-action="route"][data-id="loom"]');
      await card.locator(".route-map").scrollIntoViewIfNeeded();
      const view = await card.evaluate((el) => {
        const svg = el.querySelector(".route-map"),
          r = svg.getBoundingClientRect(),
          world = document.querySelector("#world").getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          title: parseFloat(
            getComputedStyle(el.querySelector(".route-layout strong")).fontSize,
          ),
          hint: parseFloat(
            getComputedStyle(el.querySelector(".route-layout small")).fontSize,
          ),
          target: document
            .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            ?.closest('[data-action="route"]')?.dataset.id,
          noOverflow:
            document.querySelector(".panel").scrollWidth <=
            document.querySelector(".panel").clientWidth,
          ratio: world.width / world.height,
          readable: [...document.querySelectorAll(".route-layout")].map(
            (layout) => {
              const card = layout
                .closest(".route-card")
                .getBoundingClientRect();
              const text = layout
                .querySelector("small")
                .getBoundingClientRect();
              const map = layout.querySelector("svg").getBoundingClientRect();
              return {
                textWidth: text.width,
                contained:
                  text.x >= card.x &&
                  text.right <= card.right &&
                  map.x >= card.x &&
                  map.right <= card.right,
              };
            },
          ),
        };
      });
      expect(view.width).toBe(84);
      expect(view.height).toBe(51);
      expect(view.title).toBeGreaterThanOrEqual(11);
      expect(view.hint).toBeGreaterThanOrEqual(10);
      expect(view.target).toBe("loom");
      expect(view.noOverflow).toBe(true);
      expect(view.ratio).toBeCloseTo(1.6, 3);
      for (const item of view.readable) {
        expect(item.textWidth).toBeGreaterThanOrEqual(80);
        expect(item.contained).toBe(true);
      }
      sizes.push({ width, height, ...view });
    }
    await page.screenshot({
      path: artifactPath(`echo-layouts-touch-${browserName}.png`),
    });
    const rect = await page
      .locator('[data-action="route"][data-id="loom"] .route-map')
      .boundingBox();
    await watchEntry(page);
    await page.touchscreen.tap(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    const arrived = await entry(page);
    verifyEntry(arrived, expected(profile.run, 17, "loom"));
    await pause(page);
    expect(errors).toEqual([]);
    await proof("touch", browserName, {
      scope:
        "Prepared cleared stage-16 checkpoint; actual keyboard navigation and native touchscreen tap at decorative SVG center. Three viewport layouts, independent SVG/tile equality, unchanged state/RGBA/save across paused resize. Headless touch context, not a physical phone.",
      previews,
      sizes,
      arrived,
      errors,
    });
  } finally {
    await context.close();
  }
});
