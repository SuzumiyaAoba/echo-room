import { test, expect } from "@playwright/test";
import { ROOM_COUNT, isCamp } from "../../src/content.js";

async function start(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await expect(
    page.getByRole("button", { name: "この灯りで出発する" }),
  ).toBeInViewport();
  await page.locator("#seed").fill("BROWSER-TEST");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.getByRole("button", { name: "最初のひと針へ" }).click();
  await page.bringToFront();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
test("タイトルから操作し、残響・解放・一時停止・復帰を検証", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(650);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 24,
    null,
    { polling: "raf", timeout: 5000 },
  );
  await page.keyboard.press("KeyQ");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().echoes))
    .toBe(1);
  await page.screenshot({ path: "test-results/combat.png" });
  await page.keyboard.press("KeyR");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().echoes))
    .toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  const time = await page.evaluate(
    () => window.__ECHO_LOOM__.snapshot().run.time,
  );
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.time),
  ).toBe(time);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().paused))
    .toBe(false);
  expect(errors).toEqual([]);
});
test("戦闘・報酬・分岐・行商・ボス・結末の全24部屋をつなぐ", async ({
  page,
}) => {
  await start(page);
  for (let stage = 0; stage < ROOM_COUNT; stage++) {
    const snapshot = await page.evaluate(() => window.__ECHO_LOOM__.snapshot());
    expect(snapshot.run.stage).toBe(stage);
    if (isCamp(stage)) {
      await page.getByRole("button", { name: "灯りを持って進む" }).click();
    } else {
      // This flow test exercises the real damage, room-clear and reward machinery.
      // Encounter balance is verified separately without this shortcut.
      await page.evaluate(() => {
        const g = window.__ECHO_LOOM__.game();
        for (const n of g.spawnQueue) g.spawn(n.kind, n.x, n.y);
        g.spawnQueue = [];
        for (const e of [...g.enemies]) g.damageEnemy(e, e.hp, "thread");
      });
      if (stage === ROOM_COUNT - 1) break;
      await expect
        .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().mode))
        .toMatch(/reward|cleared/);
      if (await page.locator('[data-action="upgrade"]').count())
        await page.locator('[data-action="upgrade"]').first().click();
    }
    await page.evaluate(() => {
      const g = window.__ECHO_LOOM__.game();
      g.player.x = 240;
      g.player.y = 43;
    });
    await page.keyboard.press("KeyE");
    await expect(page.locator('[data-action="route"]')).not.toHaveCount(0);
    if (isCamp(stage + 1))
      await page.locator('[data-action="route"][data-id="salvage"]').click();
    else await page.locator('[data-action="route"]').first().click();
  }
  await expect(page.getByRole("heading", { name: "明日の灯り" })).toBeVisible();
  await page.screenshot({ path: "test-results/victory.png" });
  await page.getByRole("button", { name: "灯台へ帰る" }).click();
  await page.getByRole("button", { name: "記憶の書庫" }).click();
  await expect(
    page.getByRole("heading", { name: "04 / 明日の灯" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: "灯守の工房" }).click();
  await page.getByRole("button", { name: "35 記憶片で解放" }).click();
  await page.getByRole("button", { name: "灯台へ戻る" }).click();
  await page.reload();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await expect(
    page.locator('[data-action="weapon"][data-id="scatter"]'),
  ).toBeEnabled();
});
test("保存した部屋から再開し、音量設定が保持される", async ({ page }) => {
  await start(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#music-volume").fill("0.1");
  await page.locator("#setting-shake").uncheck();
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯台へ戻る" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "航路を続ける" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.locator("#music-volume")).toHaveValue("0.1");
  await expect(page.locator("#setting-shake")).not.toBeChecked();
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.seed))
    .toBe("BROWSER-TEST");
});
test("横向きのタッチ画面で操作 UI と出発ボタンが使える", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  const page = await context.newPage();
  await start(page);
  await expect(page.locator(".touch-controls")).toBeVisible();
  const stick = await page.locator('[data-stick="move"]').boundingBox();
  await page.mouse.move(
    stick.x + stick.width / 2 + 20,
    stick.y + stick.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().player.x),
  ).toBeGreaterThan(260);
  const stopped = await page.evaluate(
    () => window.__ECHO_LOOM__.snapshot().player.x,
  );
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().player.x),
  ).toBeCloseTo(stopped, 1);
  await page.evaluate(() => window.__ECHO_LOOM__.game().addUpgrade("double"));
  const echoButton = await page
    .getByRole("button", { name: "残響", exact: true })
    .boundingBox();
  await page.touchscreen.tap(
    echoButton.x + echoButton.width / 2,
    echoButton.y + echoButton.height / 2,
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.echoesCast),
    )
    .toBe(1);
  await page.screenshot({ path: "test-results/touch.png" });
  await context.close();
});
test("ゲームパッドでメニュー・移動・照準・残響・停止と復帰を操作できる", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__pad = {
      mapping: "standard",
      connected: true,
      index: 0,
      id: "Standard API test pad",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [window.__pad],
    });
  });
  await page.goto("/");
  const press = async (index) => {
    await page.evaluate(
      (i) => (window.__pad.buttons[i] = { pressed: true, value: 1 }),
      index,
    );
    await page.waitForTimeout(150);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.evaluate(
      (i) => (window.__pad.buttons[i] = { pressed: false, value: 0 }),
      index,
    );
    await page.waitForTimeout(150);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
  await press(0);
  await expect(page.getByRole("heading", { name: "旅の支度" })).toBeVisible();
  await press(0);
  await expect(
    page.getByRole("heading", { name: "昨日と、光を織る" }),
  ).toBeVisible();
  await press(0);
  await page.evaluate(() => {
    window.__pad.axes = [0.8, 0, 1, 0];
    window.__pad.buttons[7] = { pressed: true, value: 1 };
  });
  await page.waitForTimeout(650);
  await press(5);
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().echoes))
    .toBe(1);
  const p = await page.evaluate(() => window.__ECHO_LOOM__.snapshot().player);
  expect(p.x).toBeGreaterThan(260);
  expect(Math.abs(p.angle)).toBeLessThan(0.01);
  await press(9);
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  await press(9);
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().paused))
    .toBe(false);
});
