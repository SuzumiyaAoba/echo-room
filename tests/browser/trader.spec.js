import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRun } from "../../src/game.js";
import { UPGRADES, rank } from "../../src/content.js";
import { traderStock, traderPrice } from "../../src/trader.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

const artifacts = ".mdxr/20261007195700-echo-loom/assets";
function profile(stage = 2) {
  const p = freshProfile();
  p.attempts = 1;
  p.run = Object.assign(createRun("TRADER-BROWSER"), {
    stage,
    route: "salvage",
    checkpoint: stage === 1 ? "cleared" : "entry",
    hp: 40,
    scrap: 150,
    time: 13,
    kills: 7,
  });
  return p;
}
async function open(page, p) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: p },
  );
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await page.bringToFront();
}
const buys = (page) => page.locator('[data-action="buy"]');
const heal = (page) => page.locator('[data-action="buyheal"]');
const stockIds = (page) =>
  buys(page).evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).run, SAVE_KEY);
async function resume(page) {
  await page.reload();
  await page.locator('[data-action="continue"]').click();
}
async function toRoute(page) {
  // Move only in the already completed room, to isolate the dialog flow.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 240;
    g.player.y = 43;
  });
  await page.keyboard.press("KeyE");
}

test("行商の名前・効果・値段を航路で読み、購入と回復の後も同じ在庫と支払いで再開する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, profile(1));
  await toRoute(page);
  const card = page.locator('[data-action="route"][data-id="salvage"]');
  const forecast = (await card.getAttribute("data-stock")).split(",");
  expect(forecast).toHaveLength(3);
  for (const id of forecast) {
    const u = UPGRADES.find((item) => item.id === id);
    const item = card.locator(`.route-stock-item[data-id="${id}"]`);
    await expect(item).toContainText(u.name);
    await expect(item).toContainText(u.desc);
    await expect(item).toContainText(`歯車 ${traderPrice(u)}`);
  }
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/trader-route-preview.png` });
  await card.click();
  expect(await stockIds(page)).toEqual(forecast);
  expect((await saved(page)).checkpoint).toBe("shop");
  for (const id of forecast.slice(0, 2)) {
    const before = await saved(page),
      u = UPGRADES.find((item) => item.id === id);
    await page.locator(`[data-action="buy"][data-id="${id}"]`).click();
    const after = await saved(page);
    expect(after.scrap).toBe(before.scrap - traderPrice(u));
    expect(rank(after, id)).toBe(rank(before, id) + 1);
    expect(after.shopBought).toContain(id);
    await expect(
      page.locator(`[data-action="buy"][data-id="${id}"]`),
    ).toBeDisabled();
    await resume(page);
    expect(await saved(page)).toEqual(after);
    expect(await stockIds(page)).toEqual(forecast);
  }
  const beforeHeal = await saved(page);
  await heal(page).click();
  const healed = await saved(page);
  expect(healed.hp).toBe(Math.min(beforeHeal.maxHp, beforeHeal.hp + 30));
  expect(healed.scrap).toBe(beforeHeal.scrap - 20);
  await resume(page);
  expect(await saved(page)).toEqual(healed);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/trader-after-resume.png` });
  await page.locator('[data-action="campdone"]').click();
  expect((await saved(page)).checkpoint).toBe("cleared");
  await resume(page);
  await expect(buys(page)).toHaveCount(0);
  await toRoute(page);
  await page.locator('[data-action="route"][data-id="loom"]').click();
  expect((await saved(page)).shopBought).toBeUndefined();
  expect((await saved(page)).stage).toBe(3);
  expect(errors).toEqual([]);
});

test("買いもの途中の実ファイルを取り込み、購入済みの織片を重ねず続けられる", async ({
  page,
  browser,
}) => {
  await open(page, profile());
  const initial = await stockIds(page),
    first = initial[0];
  await page.locator(`[data-action="buy"][data-id="${first}"]`).click();
  await heal(page).click();
  const paid = await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const record = await readFile(await (await downloaded).path(), "utf8");
  expect(JSON.parse(record).profile.run).toEqual(paid);
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.goto("/");
    await other.getByRole("button", { name: "設定", exact: true }).click();
    await other.locator("#save-file").setInputFiles({
      name: "trader-record.json",
      mimeType: "application/json",
      buffer: Buffer.from(record),
    });
    await expect(other.locator(".import-summary")).toContainText(
      "行商で買いものの途中",
    );
    await other
      .getByRole("button", { name: "記録を取り込む", exact: true })
      .click();
    await resume(other);
    expect(await saved(other)).toEqual(paid);
    expect(await stockIds(other)).toEqual(initial);
    await expect(
      other.locator(`[data-action="buy"][data-id="${first}"]`),
    ).toBeDisabled();
  } finally {
    await context.close();
  }
});

test("上限に達した購入・新しい前提・織片が尽きた行商でも在庫と保存が崩れない", async ({
  browser,
}) => {
  for (const scenario of ["cap", "prerequisite", "exhausted"]) {
    const p = profile();
    const wanted = scenario === "cap" ? "damage" : "double";
    if (scenario === "exhausted") {
      for (const u of UPGRADES) p.run.upgrades[u.id] = u.max;
      p.run.scrap = 20;
    } else {
      p.run.upgrades.damage = scenario === "cap" ? 3 : 0;
      for (let seed = 0; seed < 100; seed++) {
        p.run.seed = `TRADER-${scenario}-${seed}`;
        if (traderStock(p.run).some((u) => u.id === wanted)) break;
      }
      expect(traderStock(p.run).some((u) => u.id === wanted)).toBe(true);
    }
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await open(page, p);
      const initial = await stockIds(page);
      if (scenario === "exhausted") {
        await expect(buys(page)).toHaveCount(0);
        await expect(page.locator(".panel-content")).toContainText(
          "回復薬は用意してあるよ",
        );
        await heal(page).click();
        expect(await saved(page)).toMatchObject({
          hp: 70,
          scrap: 0,
          checkpoint: "shop",
        });
        await resume(page);
        await expect(heal(page)).toBeDisabled();
      } else {
        await page.locator(`[data-action="buy"][data-id="${wanted}"]`).click();
        const paid = await saved(page);
        expect(rank(paid, wanted)).toBe(scenario === "cap" ? 4 : 1);
        expect(await stockIds(page)).toEqual(initial);
        if (scenario === "prerequisite")
          expect(initial).not.toContain("triangle");
        await resume(page);
        expect(await stockIds(page)).toEqual(initial);
        await expect(
          page.locator(`[data-action="buy"][data-id="${wanted}"]`),
        ).toBeDisabled();
      }
    } finally {
      await context.close();
    }
  }
});

test("横向きタッチ画面で行商の予告を読み、回復と購入を実際の座標で選べる", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  try {
    const page = await context.newPage();
    await open(page, profile(1));
    await toRoute(page);
    const route = page.locator('[data-action="route"][data-id="salvage"]');
    await expect(route.locator(".route-stock-item")).toHaveCount(3);
    expect(
      await page
        .locator(".panel-content")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await route.click();
    await heal(page).scrollIntoViewIfNeeded();
    const box = await heal(page).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest("[data-action]")?.dataset
            .action,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ),
    ).toBe("buyheal");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect(await saved(page)).toMatchObject({ hp: 70, scrap: 130 });
    const first = buys(page).first();
    const id = await first.getAttribute("data-id");
    await first.scrollIntoViewIfNeeded();
    await first.tap();
    expect((await saved(page)).shopBought).toEqual([id]);
    await heal(page).scrollIntoViewIfNeeded();
    if (browserName === "chromium")
      await page.screenshot({ path: `${artifacts}/trader-touch.png` });
    expect(
      await page
        .locator(".panel")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.locator('[data-action="campdone"]').tap();
    expect((await saved(page)).checkpoint).toBe("cleared");
  } finally {
    await context.close();
  }
});
