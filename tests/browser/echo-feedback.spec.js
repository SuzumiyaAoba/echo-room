import { test, expect } from "@playwright/test";
import { freshProfile, SAVE_KEY } from "../../src/save.js";
import { createRun } from "../../src/game.js";

async function start(page, upgrades = {}) {
  const profile = freshProfile();
  profile.settings.flashes = false;
  profile.run = createRun("BROWSER-ECHO-CLOCK");
  Object.assign(profile.run.upgrades, upgrades);
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: SAVE_KEY,
    raw: JSON.stringify(profile),
  });
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  // Isolate timing from enemies; movement, recording, Q/R, recharge and expiry
  // still run through ordinary input and the unmodified simulation loop.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.spawnQueue = [{ time: Infinity }];
    g.enemies = [];
    g.bullets = [];
    g.player.x = 100;
    g.player.y = 160;
    for (const row of g.tiles)
      for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  });
}
const state = (page) =>
  page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      time: g.run.time,
      charges: g.player.echoCharges,
      cd: g.player.echoCd,
      elapsed: g.echoes.map((e) => e.elapsed),
      duration: g.stats.echoDuration,
      next: document.querySelector("#echo-next").textContent,
      life: document.querySelector("#echo-life-status").textContent,
    };
  });

test("実際の移動と二回のQで手持ち・次の充填・最短寿命を示し、一時停止で全て止まる", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page, { double: 2, quickecho: 3, duration: 2 });
  await page.keyboard.down("KeyD");
  await page.waitForFunction(() => window.__ECHO_LOOM__.game().player.x >= 180);
  await page.keyboard.up("KeyD");
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 1,
  );
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 2,
  );
  await expect(page.locator("#echo-status")).toHaveText("READY · 1/3");
  await expect(page.locator("#echo-next")).toContainText("次の1回");
  await expect(page.locator('.charge-slot[data-state="ready"]')).toHaveCount(1);
  await expect(page.locator('.charge-slot[data-state="charging"]')).toHaveCount(
    1,
  );
  await expect(page.locator('.charge-slot[data-state="empty"]')).toHaveCount(1);
  await expect(page.locator("#echo-life-status")).toContainText("最短");
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  // Let the 10 Hz HUD catch the last simulation frame before reading it.
  await expect
    .poll(async () => (await state(page)).life)
    .toMatch(/最短 \d\.\d秒/);
  await page.waitForTimeout(150);
  const before = await state(page);
  const remaining = before.duration - Math.max(...before.elapsed);
  expect(before.life).toBe(
    `最短 ${(Math.ceil(remaining * 10 - 1e-7) / 10).toFixed(1)}秒`,
  );
  await page.waitForTimeout(350);
  expect(await state(page)).toEqual(before);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await expect.poll(async () => (await state(page)).charges).toBe(2);
  await expect(page.locator("#echo-status")).toHaveText("READY · 2/3");
  await expect(page.locator("#echo-next")).toContainText("次の1回");
  await page.keyboard.press("KeyR");
  await expect(page.locator("#echo-life-status")).toBeHidden();
  await expect(page.locator("#burst-status")).toHaveText("残響をほどく");
  expect(errors).toEqual([]);
});

test("640幅のタッチ画面で寿命と蓄えを読み、自然消滅後に残った五本をRで返す", async ({
  browser,
  browserName,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page, { double: 2, duration: 1, counter: 1 });
  await page.getByRole("button", { name: "一時停止", exact: true }).tap();
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.history = Array.from({ length: 216 }, () => ({
      x: 130,
      y: 150,
      angle: 0,
      fire: false,
    }));
    for (let i = 0; i < 3; i++) g.castEcho();
    [5.2, 3, 0.6].forEach((elapsed, i) => {
      g.echoes[i].elapsed = elapsed;
      g.echoes[i].returnStock = [1, 3, 2][i];
    });
  });
  await expect(page.locator("#echo-life-status")).toHaveText("最短 0.6秒");
  await expect(page.locator("#echo-life-status")).toHaveAttribute(
    "data-urgent",
    "true",
  );
  await expect(page.locator("#burst-status")).toHaveText("3残響 · 蓄え6");
  for (const selector of [
    "#echo-status",
    "#echo-next",
    "#echo-life-status",
    "#burst-status",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(640);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    const visible = await page
      .locator(selector)
      .evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(visible).toBe(true);
  }
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).tap();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().echoes.length))
    .toBe(2);
  await page.getByRole("button", { name: "一時停止", exact: true }).tap();
  await expect(page.locator("#burst-status")).toHaveText("2残響 · 蓄え5");
  await expect(page.locator("#echo-life-status")).toHaveAttribute(
    "data-urgent",
    "false",
  );
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).tap();
  await page.locator('[data-touch-key="KeyR"]').tap();
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.game().run.threadReturns),
    )
    .toBe(5);
  await expect(page.locator("#echo-life-status")).toBeHidden();
  // A real Q tap consumes a recharged reserve and creates a fresh live echo.
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().player.echoCharges > 0,
  );
  await page.locator('[data-touch-key="KeyQ"]').tap();
  await expect(page.locator("#echo-life-status")).toContainText("寿命あと");
  const dock = await page.locator(".action-dock").boundingBox();
  for (const key of ["KeyQ", "KeyR"]) {
    const button = await page
      .locator(`[data-touch-key="${key}"]`)
      .boundingBox();
    const overlaps =
      button.x < dock.x + dock.width &&
      button.x + button.width > dock.x &&
      button.y < dock.y + dock.height &&
      button.y + button.height > dock.y;
    expect(overlaps).toBe(false);
  }
  await page.screenshot({ path: testInfo.outputPath("echo-clock-touch.png") });
  expect(errors).toEqual([]);
  await context.close();
});

test("寿命と最大数を実際に強化するとHUDが現在値に追従し、確認中の保存を変えない", async ({
  page,
}) => {
  await start(page);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 24,
  );
  await page.keyboard.press("KeyQ");
  await expect(page.locator("#echo-life-status")).toBeVisible();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.waitForTimeout(150);
  const before = await state(page);
  const saved = await page.evaluate(
    (key) => localStorage.getItem(key),
    SAVE_KEY,
  );
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.addUpgrade("duration");
    g.addUpgrade("double");
    g.addUpgrade("double");
  });
  await expect(page.locator(".charge-slot")).toHaveCount(3);
  await page.waitForTimeout(150);
  const after = await state(page);
  expect(after.duration - before.duration).toBeCloseTo(1.2);
  expect(after.elapsed).toEqual(before.elapsed);
  const remaining = after.duration - after.elapsed[0];
  expect(after.life).toBe(
    `寿命あと ${(Math.ceil(remaining * 10 - 1e-7) / 10).toFixed(1)}秒`,
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
  ).toBe(saved);
});
