import { test, expect } from "@playwright/test";
import { SAVE_KEY } from "../../src/save.js";
import {
  offeredProfile,
  weavingChoiceProfile,
} from "../fixtures/upgrade-preview.js";

test.use({ hasTouch: true });
const artifacts = ".mdxr/20261007195700-echo-loom/assets";
async function open(page, profile) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: profile },
  );
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await page.bringToFront();
}
const card = (page, id, action = "upgrade") =>
  page.locator(`[data-action="${action}"][data-id="${id}"]`);
const effect = (target, key) =>
  target.locator(`[data-effect="${key}"] .effect-values`);
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).run, SAVE_KEY);
async function reload(page) {
  await page.reload();
  await page.locator('[data-action="continue"]').click();
}
async function geometry(target) {
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const body = node.closest(".panel-content").getBoundingClientRect();
    const cx = bounds.left + bounds.width / 2,
      cy =
        (Math.max(bounds.top, body.top) +
          Math.min(bounds.bottom, body.bottom)) /
        2;
    return {
      horizontalOverflow: [
        ...node.querySelectorAll(
          ".upgrade-comparison,.upgrade-effect,.effect-values",
        ),
      ].some((n) => n.scrollWidth > n.clientWidth + 1),
      centerHitsCard:
        document.elementFromPoint(cx, cy)?.closest("[data-action]") === node,
    };
  });
}

for (const [name, viewport] of Object.entries({
  desktop: { width: 1200, height: 850 },
  small: { width: 640, height: 360 },
})) {
  test(`${name}：同じ三枚の充填と反撃を比べ、選んだ効果と再開を保つ`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const profile = weavingChoiceProfile();
    // Preserve the original three-card comparison as a legacy version 2 case.
    profile.run.catalogVersion = 2;
    await open(page, profile);
    const ids = await page
      .locator('[data-action="upgrade"]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
    expect([...ids].sort()).toEqual(["counter", "quickecho", "refund"].sort());
    const before = await saved(page);
    if (name === "small") {
      const titlesVisible = await page
        .locator('[data-action="upgrade"] h3')
        .evaluateAll((titles) =>
          titles.every((title) => {
            const r = title.getBoundingClientRect(),
              body = title.closest(".panel-content").getBoundingClientRect();
            return r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
          }),
        );
      expect(
        titlesVisible,
        "All three names should be readable before scrolling",
      ).toBe(true);
    }
    const readout = page.getByRole("group", { name: "いまの灯り" });
    await expect(readout).toContainText("体力 89 / 120");
    await expect(readout).toContainText("残響 最大2体");
    await expect(readout).toContainText("充填 7.0秒");
    await expect(readout).toContainText("寿命 5.8秒");
    await expect(effect(card(page, "quickecho"), "echoCooldown")).toHaveText(
      "7.0秒→5.6秒",
    );
    await expect(effect(card(page, "counter"), "returnStock")).toHaveText(
      "0発→3発",
    );
    await expect(effect(card(page, "refund"), "refund")).toHaveText(
      "0秒短縮→1秒短縮",
    );
    for (const id of ids)
      expect(await geometry(card(page, id))).toEqual({
        horizontalOverflow: false,
        centerHitsCard: true,
      });
    expect(await saved(page)).toEqual(before);
    await reload(page);
    expect(await saved(page)).toEqual(before);
    await expect(effect(card(page, "quickecho"), "echoCooldown")).toHaveText(
      "7.0秒→5.6秒",
    );
    if (info.project.name === "chromium")
      await page.screenshot({
        path: `${artifacts}/upgrade-choice-after-${name}.png`,
      });
    if (name === "small" && info.project.name === "chromium") {
      await card(page, "counter")
        .locator(".upgrade-comparison")
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${artifacts}/upgrade-choice-after-small-values.png`,
      });
    }
    if (name === "small") await card(page, "quickecho").tap();
    else await page.keyboard.press(`Digit${ids.indexOf("quickecho") + 1}`);
    expect(await saved(page)).toMatchObject({
      checkpoint: "cleared",
      hp: before.hp,
      scrap: before.scrap,
      upgrades: { quickecho: 1 },
    });
    expect(
      await page.evaluate(() => window.__ECHO_LOOM__.game().stats.echoCooldown),
    ).toBe(5.6);
    await reload(page);
    expect((await saved(page)).upgrades.quickecho).toBe(1);
    expect(
      await page.evaluate(() => window.__ECHO_LOOM__.game().stats.echoCooldown),
    ).toBe(5.6);
    expect(errors).toEqual([]);
  });
}

test("射撃の取得前後に、武器の基礎威力と強化された返し針を別に示す", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(
    page,
    offeredProfile("damage", {
      upgrades: { counter: 1, damage: 1, echopower: 1 },
    }),
  );
  const target = card(page, "damage"),
    before = await saved(page);
  await expect(effect(target, "damage")).toHaveText("27.6→32.2");
  await expect(effect(target, "returnedDamage")).toHaveText("18.7→21.8");
  expect(await geometry(target)).toEqual({
    horizontalOverflow: false,
    centerHitsCard: true,
  });
  expect(await saved(page)).toEqual(before);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/upgrade-damage-preview.png` });
  await target.click();
  expect((await saved(page)).upgrades.damage).toBe(2);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().stats.damage),
  ).toBe(1.4);
  expect(errors).toEqual([]);
});

test("640幅でも長い条件付きの効果をカード内で読み、実際にタップして選ぶ", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 640, height: 360 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, offeredProfile("cascade"));
  const target = card(page, "cascade");
  await expect(effect(target, "cascade")).toHaveText(
    "なし→1発ごと1本・最大24本",
  );
  expect(await geometry(target)).toEqual({
    horizontalOverflow: false,
    centerHitsCard: true,
  });
  if (info.project.name === "chromium")
    await page.screenshot({
      path: `${artifacts}/upgrade-conditional-small.png`,
    });
  await target.tap();
  expect((await saved(page)).upgrades.cascade).toBe(1);
  expect(errors).toEqual([]);
});

test("行商で充填を買い、購入後は現在の値を示して同じ支払いで再開する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(
    page,
    offeredProfile("quickecho", { upgrades: { double: 1, duration: 1 } }, true),
  );
  const target = card(page, "quickecho", "buy"),
    before = await saved(page);
  await expect(effect(target, "echoCooldown")).toHaveText("7.0秒→5.6秒");
  expect(await saved(page)).toEqual(before);
  await target.click();
  const paid = await saved(page);
  expect(paid.scrap).toBe(before.scrap - 30);
  expect(paid.shopBought).toContain("quickecho");
  await expect(target).toBeDisabled();
  await expect(target.locator('[data-preview="current"]')).toHaveCount(1);
  await expect(effect(target, "echoCooldown")).toHaveText("5.6秒");
  await expect(page.getByRole("group", { name: "いまの灯り" })).toContainText(
    "充填 5.6秒",
  );
  await reload(page);
  expect(await saved(page)).toEqual(paid);
  await expect(
    effect(card(page, "quickecho", "buy"), "echoCooldown"),
  ).toHaveText("5.6秒");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/upgrade-trader-after.png` });
  expect(errors).toEqual([]);
});

test("640幅の行商で体力の増加を比べ、購入と回復後の現在値を混同しない", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 640, height: 360 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(
    page,
    offeredProfile("health", { maxHp: 120, upgrades: { health: 1 } }, true),
  );
  const target = card(page, "health", "buy"),
    before = await saved(page);
  await expect(effect(target, "maxHp")).toHaveText("120→140");
  await expect(effect(target, "hp")).toHaveText("40→60");
  expect(await geometry(target)).toEqual({
    horizontalOverflow: false,
    centerHitsCard: true,
  });
  if (info.project.name === "chromium")
    await page.screenshot({
      path: `${artifacts}/upgrade-health-trader-small.png`,
    });
  await target.tap();
  await expect(effect(target, "hp")).toHaveText("60");
  await page.locator('[data-action="buyheal"]').tap();
  await expect(effect(target, "hp")).toHaveText("90");
  const paid = await saved(page);
  expect(paid).toMatchObject({
    hp: 90,
    maxHp: 140,
    scrap: before.scrap - 50,
    upgrades: { health: 2 },
  });
  await reload(page);
  expect(await saved(page)).toEqual(paid);
  await expect(effect(card(page, "health", "buy"), "hp")).toHaveText("90");
  expect(errors).toEqual([]);
});

test("二つの残響を持つ旅では三つ目の容量を示し、取得後の実際の充填回数へ反映する", async ({
  page,
}) => {
  await open(page, offeredProfile("double", { upgrades: { double: 1 } }));
  const target = card(page, "double");
  await expect(effect(target, "echoes")).toHaveText("2体→3体");
  await target.click();
  expect(
    await page.evaluate(() => ({
      max: window.__ECHO_LOOM__.game().stats.echoes,
      charges: window.__ECHO_LOOM__.game().player.echoCharges,
    })),
  ).toEqual({ max: 3, charges: 3 });
  await reload(page);
  expect((await saved(page)).upgrades.double).toBe(2);
});
