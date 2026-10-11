import { test, expect } from "@playwright/test";
import { freshProfile, exportProfile, SAVE_KEY } from "../../src/save.js";
import { createRun } from "../../src/game.js";

const windows = [
  { width: 640, height: 360 },
  { width: 844, height: 390 },
  { width: 900, height: 600 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
];

async function enter(page, touch = false) {
  const profile = freshProfile();
  profile.settings.flashes = false;
  profile.run = createRun("READABLE-HUD");
  profile.run.stage = 23;
  Object.assign(profile.run.upgrades, {
    double: 2,
    duration: 3,
    quickecho: 3,
    counter: 1,
  });
  if (!touch)
    await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
      key: SAVE_KEY,
      raw: JSON.stringify(profile),
    });
  await page.goto("/");
  if (touch) {
    await page.getByRole("button", { name: "設定", exact: true }).tap();
    await page.locator("#save-file").setInputFiles({
      name: "readable-hud.json",
      mimeType: "application/json",
      buffer: Buffer.from(exportProfile(profile)),
    });
    await page
      .getByRole("button", { name: "記録を取り込む", exact: true })
      .tap();
    await page.locator('[data-action="continue"]').tap();
  } else await page.locator('[data-action="continue"]').click();
  await expect(page.locator("#bossbar")).toBeVisible();
}

async function legibility(page, selectors) {
  return page.evaluate((selectors) => {
    const fields = selectors.map((selector) => {
      const el = document.querySelector(selector),
        style = getComputedStyle(el),
        b = el.getBoundingClientRect(),
        parent = el.parentElement.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      return {
        selector,
        font: parseFloat(style.fontSize),
        visible: !!el.getClientRects().length,
        inside:
          b.x >= -0.5 &&
          b.y >= -0.5 &&
          b.right <= innerWidth + 0.5 &&
          b.bottom <= innerHeight + 0.5,
        overflow:
          style.display === "inline"
            ? text.x < parent.x - 1 || text.right > parent.right + 1
            : el.scrollWidth > el.clientWidth + 1,
      };
    });
    const canvas = document.querySelector("#world").getBoundingClientRect();
    return { fields, canvasRatio: canvas.width / canvas.height };
  }, selectors);
}

async function check(page, selectors) {
  const result = await legibility(page, selectors);
  expect(result.canvasRatio).toBeCloseTo(1.6, 2);
  for (const field of result.fields) {
    expect(field.font, field.selector).toBeGreaterThanOrEqual(10);
    if (field.visible) {
      expect(field.inside, field.selector).toBe(true);
      expect(field.overflow, field.selector).toBe(false);
    }
  }
}

const combatFields = [
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

test("七つの画面サイズで戦闘の文字と二つの時計を読み、縦向きの練習でもお題を保つ", async ({
  page,
}) => {
  await enter(page);
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 1,
  );
  await page.keyboard.press("KeyQ");
  await expect(page.locator("#echo-next")).toBeVisible();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  for (const viewport of windows) {
    await page.setViewportSize(viewport);
    await check(page, combatFields);
  }
  await page.locator('[data-action="savehome"]').click();
  const saved = await page.evaluate(
    (key) => localStorage.getItem(key),
    SAVE_KEY,
  );
  await page.getByRole("button", { name: "灯りの練習", exact: true }).click();
  for (const viewport of [windows[5], windows[0]]) {
    await page.setViewportSize(viewport);
    await check(page, [
      "#health-number",
      ".hud-location",
      "#practice-title",
      "#practice-hint",
      "#practice-keys",
    ]);
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "練習を終える", exact: true }).click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
  ).toBe(saved);
});

test("縦向きの余白へ置いた操作欄で実際に移動・射撃・Q/R・停止を行い、横向きへ回転して続ける", async ({
  browser,
  browserName,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: windows[5],
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  const page = await context.newPage();
  try {
    await enter(page, true);
    const drag = async (id, ready) => {
      const box = await page.locator(`[data-stick="${id}"]`).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
      await page.waitForFunction(ready);
      await page.mouse.up();
    };
    const beforeX = await page.evaluate(
      () => window.__ECHO_LOOM__.game().player.x,
    );
    const box = await page.locator('[data-stick="move"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
    await page.waitForFunction(
      (x) => window.__ECHO_LOOM__.game().player.x > x + 12,
      beforeX,
    );
    await page.mouse.up();
    await drag("aim", () =>
      window.__ECHO_LOOM__.game().bullets.some((b) => b.friendly),
    );
    for (const viewport of [windows[5], windows[0], windows[6]]) {
      await page.setViewportSize(viewport);
      await page.locator('[data-touch-key="KeyQ"]').tap();
      await expect(page.locator("#echo-life-status")).toBeVisible();
      await check(page, combatFields);
      for (const selector of [
        '[data-action="pause"]',
        '[data-action="inventory"]',
        '[data-stick="move"]',
        '[data-stick="aim"]',
        '[data-touch-key="Space"]',
        '[data-touch-key="KeyQ"]',
        '[data-touch-key="KeyR"]',
        '[data-touch-key="KeyE"]',
      ]) {
        const reachable = await page.locator(selector).evaluate((el) => {
          const b = el.getBoundingClientRect(),
            top = document.elementFromPoint(
              b.x + b.width / 2,
              b.y + b.height / 2,
            );
          return {
            hit: el === top || el.contains(top),
            width: b.width,
            height: b.height,
          };
        });
        expect(reachable.hit, selector).toBe(true);
        expect(reachable.width, selector).toBeGreaterThanOrEqual(40);
        expect(reachable.height, selector).toBeGreaterThanOrEqual(40);
      }
      await page.getByRole("button", { name: "一時停止", exact: true }).tap();
      await page.getByRole("button", { name: "航路へ戻る", exact: true }).tap();
      await page.locator('[data-touch-key="KeyR"]').tap();
      await expect(page.locator("#echo-life-status")).toBeHidden();
    }
    await page.screenshot({
      path: testInfo.outputPath("readable-hud-portrait.png"),
    });
  } finally {
    await context.close();
  }
});
