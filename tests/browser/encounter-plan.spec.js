import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createRun, forecastRoom, Game } from "../../src/game.js";
import {
  createRun as beforeRun,
  Game as Before,
} from "../fixtures/tactics-before/game.js";
import { freshProfile, exportProfile, SAVE_KEY } from "../../src/save.js";

async function importFork(page, next, legacy = false) {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.run = (legacy ? beforeRun : createRun)("TACTIC-1");
  Object.assign(profile.run, { stage: next - 1, checkpoint: "cleared" });
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "prepared-fork.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportProfile(profile)),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
  // Prepared cleared-room menu fixture. Movement to the exit is diagnostic;
  // the separate full expedition verifies naturally earned combat/progression.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 240;
    g.player.y = 43;
  });
  await page.keyboard.press("KeyE");
  await expect(page.locator('[data-action="route"]')).toHaveCount(3);
  return profile.run;
}

test("三地域の九構成を三サイズで読み、実タップした航路の出現と入口の保存・再開が一致する", async ({
  browser,
}, info) => {
  const rows = [],
    ids = new Set();
  const sizes = [
    { width: 390, height: 844 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ];
  for (const [index, stage] of [1, 9, 17].entries()) {
    const context = await browser.newContext({
      viewport: sizes[index],
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      const run = await importFork(page, stage);
      for (const route of ["loom", "salvage", "rest"]) {
        const forecast = forecastRoom(run, stage, route);
        const card = page.locator(`[data-action="route"][data-id="${route}"]`);
        await expect(card.locator(".route-encounter")).toHaveAttribute(
          "data-encounter-id",
          forecast.encounter.id,
        );
        await expect(card.locator(".route-tactic")).toHaveText(
          forecast.encounter.name,
        );
        await expect(card.locator(".route-tactic-hint")).toHaveText(
          forecast.encounter.hint,
        );
        await expect(card).toContainText(`敵 ${forecast.total}体`);
        expect(
          await card
            .locator(".route-tactic-hint")
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        ).toBeGreaterThanOrEqual(10);
        ids.add(forecast.encounter.id);
      }
      expect(
        await page
          .locator(".panel")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const route = ["loom", "salvage", "rest"][index];
      const expected = new Game({ ...structuredClone(run), stage, route })
        .spawnQueue;
      const card = page.locator(`[data-action="route"][data-id="${route}"]`);
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${assets}/tactics-routes-${info.project.name}-${stage}.png`,
      });
      const box = await card.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      const action = card.locator(".detail");
      await action.scrollIntoViewIfNeeded();
      const target = await action.boundingBox();
      await page.touchscreen.tap(
        target.x + target.width / 2,
        target.y + target.height / 2,
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
      const actual = await page.evaluate(() => ({
        run: structuredClone(window.__ECHO_LOOM__.game().run),
        queue: structuredClone(window.__ECHO_LOOM__.game().spawnQueue),
        encounter: structuredClone(window.__ECHO_LOOM__.game().encounter),
      }));
      expect(actual.run.stage).toBe(stage);
      expect(actual.run.encounterVersion).toBe(1);
      expect(actual.queue).toEqual(expected);
      expect(actual.encounter).toEqual(
        forecastRoom(run, stage, route).encounter,
      );
      const frozen = () =>
        page.evaluate(() => ({
          game: JSON.stringify(window.__ECHO_LOOM__.game()),
          pixels: document.querySelector("#world").toDataURL(),
          saved: JSON.stringify(localStorage),
        }));
      const before = await frozen();
      await page.waitForTimeout(350);
      expect(await frozen()).toEqual(before);
      await page
        .getByRole("button", { name: "灯台へ戻る", exact: true })
        .click();
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        SAVE_KEY,
      );
      expect(saved.run.encounterVersion).toBe(1);
      expect(saved.run.stage).toBe(stage);
      await page.reload();
      await page.locator('[data-action="continue"]').click();
      await page.keyboard.press("Escape");
      expect(
        await page.evaluate(() => window.__ECHO_LOOM__.game().spawnQueue),
      ).toEqual(expected);
      expect(errors).toEqual([]);
      rows.push({
        stage,
        viewport: sizes[index],
        route,
        encounter: actual.encounter,
        expectedQueue: expected,
        pauseExact: true,
        reloadExact: true,
        errors,
      });
    } finally {
      await context.close();
    }
  }
  expect(ids.size).toBe(9);
  await writeFile(
    `${assets}/tactics-native-routes-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Prepared cleared-room fixtures imported through the public UI; native touch choice, pause and reload. This is not a naturally earned expedition.",
        uniqueEncounters: [...ids],
        rows,
      },
      null,
      2,
    ),
  );
});

test("新しく出発した旅は構成版を保存し、通常の射撃と残響・停止を保持する", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("TACTIC-START");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.getByRole("button", { name: "最初のひと針へ" }).click();
  await page.keyboard.down("KeyJ");
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 30,
  );
  await page.keyboard.up("KeyD");
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 1,
  );
  await page.keyboard.press("Escape");
  await page.keyboard.up("KeyJ");
  await page.waitForTimeout(150);
  const capture = () =>
    page.evaluate(
      (key) => ({
        game: JSON.stringify(window.__ECHO_LOOM__.game()),
        pixels: document.querySelector("#world").toDataURL(),
        saved: JSON.parse(localStorage.getItem(key)),
      }),
      SAVE_KEY,
    );
  const before = await capture();
  await page.waitForTimeout(350);
  expect(await capture()).toEqual(before);
  expect(before.saved.run.encounterVersion).toBe(1);
  const game = JSON.parse(before.game);
  expect(game.encounter).toBeUndefined();
  expect(game.echoes).toHaveLength(1);
  await writeFile(
    `${assets}/tactics-native-start-${info.project.name}.json`,
    JSON.stringify(
      {
        version: before.saved.run.encounterVersion,
        initialRoomUnchanged: true,
        naturalEcho: true,
        pauseExact: true,
      },
      null,
      2,
    ),
  );
});

test("旧旅の公開取り込みは構成名を追加せず、元の敵と入口を再開する", async ({
  page,
}, info) => {
  const run = await importFork(page, 9, true);
  await expect(page.locator(".route-tactic")).toHaveCount(0);
  const expected = new Before({
    ...structuredClone(run),
    stage: 9,
    route: "loom",
  }).spawnQueue;
  await page.locator('[data-action="route"][data-id="loom"]').click();
  await page.keyboard.press("Escape");
  const actual = await page.evaluate(() => ({
    run: structuredClone(window.__ECHO_LOOM__.game().run),
    queue: structuredClone(window.__ECHO_LOOM__.game().spawnQueue),
    encounter: window.__ECHO_LOOM__.game().encounter,
  }));
  expect(actual.queue).toEqual(expected);
  expect(actual.run.encounterVersion).toBeUndefined();
  expect(actual.encounter).toBeUndefined();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().spawnQueue),
  ).toEqual(expected);
  await writeFile(
    `${assets}/tactics-native-old-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Prepared legacy cleared-room fixture through public import and native route selection",
        stage: 9,
        oldQueueExact: true,
        noNewMarker: true,
        reloadExact: true,
      },
      null,
      2,
    ),
  );
});
