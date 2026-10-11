import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { freshProfile, prepareImport, SAVE_KEY } from "../../src/save.js";
import { createRun } from "../../src/game.js";
async function upload(page, buffer, name = "legacy-journey.json") {
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page
    .locator("#save-file")
    .setInputFiles({ name, mimeType: "application/json", buffer });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
}
async function download(page) {
  await page.reload();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  return prepareImport(
    (await readFile(await (await pending).path())).toString(),
  ).profile.run;
}

test("歩いて張った糸へ四発を受け、残響の三つの蓄えを解放して実際の返し針を当て、保存と実ファイルへ残す", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 640, height: 360 });
  const profile = freshProfile();
  profile.settings.flashes = false;
  profile.run = createRun("BROWSER-RETURN-LIGHT");
  profile.run.upgrades.counter = 1;
  await page.addInitScript(
    ({ key, raw }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    },
    { key: SAVE_KEY, raw: JSON.stringify(profile) },
  );
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.spawnQueue = [{ time: Infinity }];
    g.enemies = [];
    g.bullets = [];
    g.player.x = 100;
    g.player.y = 160;
    g.history = [];
    for (const row of g.tiles)
      for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  });
  await page.keyboard.down("KeyD");
  await page.waitForFunction(() => window.__ECHO_LOOM__.game().player.x >= 318);
  await page.keyboard.up("KeyD");
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().threadGuards().length > 0,
  );
  // Isolated incoming props; travel, ownership, cap, UI and release use the
  // ordinary frame loop and real recorded movement, not a difficulty shortcut.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game(),
      { a, b } = g.threadGuards()[0];
    for (let i = 0; i < 4; i++)
      g.makeBullet(
        { x: (a.x + b.x) / 2, y: 126 },
        Math.PI / 2,
        11,
        90,
        false,
        "#efa88c",
      );
  });
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().run.threadCuts === 4,
  );
  await page.screenshot({ path: testInfo.outputPath("counter-stock.png") });
  await page.getByRole("button", { name: "織片を確認", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("返し縫い");
  await expect(page.getByRole("dialog")).toContainText("1体3つ");
  await expect(page.getByRole("dialog")).toContainText("返し針 0");
  expect(
    await page.evaluate(() => {
      const g = window.__ECHO_LOOM__.game();
      return {
        stock: g.echoes[0].returnStock,
        hp: g.run.hp,
        returned: g.run.threadReturns,
      };
    }),
  ).toEqual({ stock: 3, hp: 100, returned: 0 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(page.locator("#burst-status")).toContainText("蓄え3");
  const bounds = await page.locator("#burst-status").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(640);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  const id = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return g.spawn("shooter", 240, 90).id;
  });
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().run.threadReturns === 3,
  );
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().echoes.length),
  ).toBe(0);
  await page.waitForFunction((id) => {
    const e = window.__ECHO_LOOM__.game().enemies.find((e) => e.id === id);
    return !e || e.hp < 35;
  }, id);
  await page.screenshot({ path: testInfo.outputPath("counter-return.png") });
  // Complete this fixture for checkpoint coverage; this is not a normal room's
  // win-rate or damage measurement. Native expedition coverage is separate.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.spawnQueue = [];
    for (const e of [...g.enemies]) g.damageEnemy(e, 99999, "shot");
  });
  await page.locator('[data-action="upgrade"]').first().click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => {
      const r = window.__ECHO_LOOM__.game().run;
      return {
        version: r.catalogVersion,
        cuts: r.threadCuts,
        returned: r.threadReturns,
        counter: r.upgrades.counter,
      };
    }),
  ).toEqual({ version: 3, cuts: 4, returned: 3, counter: 1 });
  const saved = await download(page);
  expect(saved.catalogVersion).toBe(3);
  expect(saved.upgrades.counter).toBe(1);
  expect(saved.threadReturns).toBe(3);
  expect(saved.threadCuts).toBe(4);
  expect(errors).toEqual([]);
});

test("追加前に実戦で書き出した行商の記録は同じ三枚・価格・購入途中で再開する", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const bytes = await readFile(
    new URL("../fixtures/legacy-trader.json", import.meta.url),
  );
  await upload(page, bytes);
  const stock = () =>
    page
      .locator('[data-action="buy"]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
  expect(await stock()).toEqual(["triangle", "speed", "dashthread"]);
  await expect(
    page.locator('[data-action="buy"][data-id="triangle"]'),
  ).toContainText("45");
  await page.locator('[data-action="buy"][data-id="triangle"]').click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(await stock()).toEqual(["triangle", "speed", "dashthread"]);
  await expect(
    page.locator('[data-action="buy"][data-id="triangle"]'),
  ).toBeDisabled();
  const saved = await download(page);
  expect(saved.catalogVersion).toBe(1);
  expect(saved.scrap).toBe(34);
  expect(saved.upgrades.triangle).toBe(1);
  expect(saved.upgrades.counter).toBe(0);
  expect(saved.threadCuts).toBe(4);
  expect(saved.threadReturns).toBe(0);
  expect(errors).toEqual([]);
});

test("追加前の支払った選択途中を取り込むと、候補・歯車・次の費用を保つ", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const profile = freshProfile();
  profile.run = createRun("OFFLINE-ROUTE");
  delete profile.run.catalogVersion;
  delete profile.run.threadReturns;
  profile.run.stage = 1;
  profile.run.checkpoint = "reward";
  profile.run.rewardRoll = 1;
  profile.run.scrap = 10;
  await page.goto("/");
  await upload(page, Buffer.from(JSON.stringify(profile)));
  const offers = () =>
    page
      .locator('[data-action="upgrade"]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
  expect(await offers()).toEqual(["rapid", "quickecho", "pierce"]);
  await expect(page.locator('[data-action="rerollreward"]')).toContainText(
    "20",
  );
  await expect(page.locator('[data-action="rerollreward"]')).toBeDisabled();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(await offers()).toEqual(["rapid", "quickecho", "pierce"]);
  await page.locator('[data-action="upgrade"][data-id="rapid"]').click();
  const saved = await download(page);
  expect(saved.catalogVersion).toBe(1);
  expect(saved.rewardRoll).toBe(1);
  expect(saved.scrap).toBe(10);
  expect(saved.upgrades.rapid).toBe(1);
  expect(saved.upgrades.counter).toBe(0);
  expect(errors).toEqual([]);
});
