import { test, expect } from "@playwright/test";
import { createRun, forecastRoom } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";
import { UPGRADES, isBoss } from "../../src/content.js";

const artifact = ".mdxr/20261007195700-echo-loom/assets";

async function atFork(page, next = 1, upgrades = {}) {
  const profile = freshProfile();
  profile.attempts = 1;
  profile.run = createRun("BROWSER-ROUTE-PROMISE");
  profile.run.stage = next - 1;
  profile.run.checkpoint = "cleared";
  profile.run.hp = 50;
  profile.run.scrap = 10;
  profile.run.upgrades = { ...upgrades };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: profile },
  );
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  // A saved cleared-room fixture isolates the menu/persistence flow from balance.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 240;
    g.player.y = 43;
  });
  await page.keyboard.press("KeyE");
  await expect(page.locator('[data-action="route"]')).toHaveCount(
    isBoss(next) ? 1 : 3,
  );
  return profile.run;
}

async function clearForFlow(page) {
  // Use the actual death/clear/reward handlers; this is not a combat skill test.
  return page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    for (const n of g.spawnQueue) g.spawn(n.kind, n.x, n.y, n.elite);
    g.spawnQueue = [];
    for (const e of [...g.enemies]) g.damageEnemy(e, e.hp, "thread");
    return (
      g.run.scrap +
      g.pickups
        .filter((p) => p.kind === "scrap")
        .reduce((sum, p) => sum + p.amount, 0)
    );
  });
}

test("航路の予告が入口の再開・戦闘後の三枚・織り込み後の保存までつながる", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const previous = await atFork(page);
  for (const route of ["loom", "rest", "salvage"]) {
    const forecast = forecastRoom(previous, 1, route);
    await expect(
      page.locator(
        `[data-action="route"][data-id="${route}"] .route-encounter`,
      ),
    ).toContainText(`敵 ${forecast.total}体`);
  }
  const loom = page.locator('[data-action="route"][data-id="loom"]');
  const promised = await loom.getAttribute("data-promised");
  const name = await loom.locator(".route-promise strong").textContent();
  await expect(loom.locator(".route-promise > span")).not.toBeEmpty();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifact}/route-forecast.png` });
  await loom.click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.stage),
  ).toBe(1);
  const offered = await page.evaluate(() =>
    window.__ECHO_LOOM__
      .game()
      .offer()
      .map((u) => u.id),
  );
  expect(offered).toContain(promised);
  await clearForFlow(page);
  await expect(page.locator('[data-action="upgrade"]')).toHaveCount(3);
  const card = page.locator(`[data-action="upgrade"][data-id="${promised}"]`);
  await expect(card).toContainText(name);
  await expect(card).toContainText("航路の織片");
  await expect(page.locator('[data-action="upgrade"].promised')).toHaveCount(1);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifact}/route-promised-reward.png` });
  await card.click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  const resumed = await page.evaluate(() => window.__ECHO_LOOM__.snapshot());
  expect(resumed.mode).toBe("cleared");
  expect(resumed.run.upgrades[promised]).toBe(1);
  await expect(page.locator('[data-action="upgrade"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const route of ["rest", "salvage"]) {
  test(`強敵の${route === "rest" ? "宿" : "宝庫"}でも予告した追加報酬とレア織片を一度だけ受け取る`, async ({
    page,
  }) => {
    const previous = await atFork(page, 6);
    const card = page.locator(`[data-action="route"][data-id="${route}"]`);
    await expect(card).toContainText("強敵あり");
    await expect(card).toContainText("レア織片");
    await expect(card).toContainText(
      route === "rest" ? /体力\s*\+30/ : /歯車\s*\+35/,
    );
    const forecast = forecastRoom(previous, 6, route);
    await card.click();
    expect(
      await page.evaluate(() => window.__ECHO_LOOM__.game().spawnQueue.length),
    ).toBe(forecast.total);
    const collected = await clearForFlow(page);
    await expect(page.locator('[data-action="upgrade"]')).toHaveCount(3);
    expect(
      await page.evaluate(() =>
        window.__ECHO_LOOM__
          .game()
          .offer()
          .some((u) => u.rarity !== "common"),
      ),
    ).toBe(true);
    const settled = await page.evaluate(
      () => window.__ECHO_LOOM__.snapshot().run,
    );
    expect(settled.hp).toBe(route === "rest" ? 80 : 50);
    expect(settled.scrap).toBe(collected + (route === "salvage" ? 35 : 0));
    await page.locator('[data-action="skipreward"]').click();
    await page.reload();
    await page.locator('[data-action="continue"]').click();
    const resumed = await page.evaluate(() => window.__ECHO_LOOM__.snapshot());
    expect(resumed.mode).toBe("cleared");
    expect(resumed.run.hp).toBe(settled.hp);
    expect(resumed.run.scrap).toBe(settled.scrap);
  });
}

test("横向きのタッチ画面で織片の説明と敵数を読め、航路を選べる", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  const page = await context.newPage();
  try {
    await atFork(page);
    const promise = page.locator(".route-promise");
    await promise.scrollIntoViewIfNeeded();
    await expect(promise).toBeInViewport();
    expect(
      await page
        .locator(".panel")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page
        .locator(".route-card")
        .first()
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    if (browserName === "chromium")
      await page.screenshot({ path: `${artifact}/route-forecast-touch.png` });
    const name = promise.locator("strong");
    const box = await name.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-action="route"]')).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.stage),
    ).toBe(1);
  } finally {
    await context.close();
  }
});

test("上限まで織り込んだ旅で、守り手と織室が残っていない報酬を予告しない", async ({
  browser,
}) => {
  for (const next of [1, 6, 7]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const upgrades = Object.fromEntries(
        UPGRADES.filter((u) => next === 1 || u.rarity !== "common").map((u) => [
          u.id,
          u.max,
        ]),
      );
      await atFork(page, next, upgrades);
      const loom = page.locator('[data-action="route"][data-id="loom"]');
      await expect(loom).not.toContainText("レア織片");
      if (next === 1) {
        expect(await loom.getAttribute("data-promised")).toBeNull();
        await expect(loom).toContainText("すべて織り込みました");
        await expect(loom.locator(".detail")).toHaveText("織り込み済み →");
      } else {
        await expect(loom).toContainText("織片");
      }
      await loom.click();
      expect(
        await page.evaluate(() =>
          window.__ECHO_LOOM__
            .game()
            .offer()
            .every((u) => u.rarity === "common"),
        ),
      ).toBe(true);
      await clearForFlow(page);
      if (next === 1) {
        await expect(page.locator('[data-action="upgrade"]')).toHaveCount(0);
        await expect(page.locator(".panel")).toContainText(
          "すべて織り込みました",
        );
      } else {
        await expect(page.locator('[data-action="upgrade"]')).toHaveCount(3);
      }
      await page.locator('[data-action="skipreward"]').click();
      expect(
        await page.evaluate(() => window.__ECHO_LOOM__.snapshot().mode),
      ).toBe("cleared");
    } finally {
      await context.close();
    }
  }
});
