import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { freshProfile, prepareImport } from "../../src/save.js";
import { createRun } from "../../src/game.js";

async function scene(page, wide = 0) {
  const profile = freshProfile();
  profile.run = createRun("BROWSER-THREAD-GUARD");
  profile.run.upgrades.wide = wide;
  await page.addInitScript((raw) => {
    if (!localStorage.getItem("echo-loom.save.v1"))
      localStorage.setItem("echo-loom.save.v1", raw);
  }, JSON.stringify(profile));
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    // Isolated props. All subsequent movement, recording, projectile travel,
    // collision, feedback and saving use the normal frame loop and public UI.
    g.spawnQueue = [{ time: Infinity }];
    g.enemies = [];
    g.bullets = [];
    g.player.x = 100;
    g.player.y = 160;
    g.history = [];
    for (const row of g.tiles)
      for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  });
}

test("実際に歩いてQで張った基礎の光糸で弾をほどき、表示・保存・実ファイルを保持する", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await scene(page);
  await page.keyboard.down("KeyD");
  await page.waitForFunction(() => window.__ECHO_LOOM__.game().player.x >= 318);
  await page.keyboard.up("KeyD");
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().threadGuards().length > 0,
  );
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game(),
      { a, b } = g.threadGuards()[0];
    g.makeBullet(
      { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 34 },
      Math.PI / 2,
      11,
      90,
      false,
      "#efa88c",
    );
  });
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().run.threadCuts === 1,
  );
  const guarded = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      hp: g.run.hp,
      cuts: g.run.threadCuts,
      width: g.stats.threadWidth,
      echoes: g.echoes.length,
      remaining: g.bullets.filter((b) => !b.friendly).length,
    };
  });
  expect(guarded).toEqual({
    hp: 100,
    cuts: 1,
    width: 3,
    echoes: 1,
    remaining: 0,
  });
  await page.screenshot({ path: testInfo.outputPath("thread-guard-cut.png") });
  await page.getByRole("button", { name: "織片を確認" }).click();
  await expect(page.getByRole("dialog")).toContainText("糸でほどいた弾 1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Finish only this empty fixture's room for checkpoint coverage. This does
  // not represent clearing a normal battle or its difficulty.
  await page.evaluate(() => {
    window.__ECHO_LOOM__.game().spawnQueue = [];
  });
  await page.locator('[data-action="upgrade"]').first().click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("echo-loom.save.v1")).run.threadCuts,
    ),
  ).toBe(1);
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().run.threadCuts),
  ).toBe(1);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const exporting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const data = await readFile(await (await exporting).path());
  expect(prepareImport(data.toString()).profile.run.threadCuts).toBe(1);
  expect(errors).toEqual([]);
});

test("最大まで広げても重なった残響は足元を守らず、通常の被弾が残る", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await scene(page, 2);
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 240;
    g.echoes = [
      {
        x: 240,
        y: 160,
        r: 5,
        elapsed: 0,
        frame: -1,
        frames: Array.from({ length: 216 }, () => ({
          x: 240,
          y: 160,
          angle: 0,
          fire: false,
          walk: 0,
          moving: false,
        })),
      },
    ];
    g.makeBullet({ x: 240, y: 144 }, Math.PI / 2, 11, 120, false, "#efa88c");
  });
  await page.waitForFunction(() => window.__ECHO_LOOM__.game().run.hp === 89);
  const state = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      cuts: g.run.threadCuts,
      guarded: g.threadGuards().length,
      damage: g.run.damageTaken,
      width: g.stats.threadWidth,
    };
  });
  expect(state).toEqual({ cuts: 0, guarded: 0, damage: 11, width: 13 });
  await page.screenshot({
    path: testInfo.outputPath("thread-guard-open-feet.png"),
  });
  expect(errors).toEqual([]);
});
