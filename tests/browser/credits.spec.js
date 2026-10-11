import { artifacts as assets } from "./artifacts.js";
import { clickOrTap } from "./interaction.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY, prepareImport } from "../../src/save.js";

const notices = await readFile("public/THIRD-PARTY-NOTICES.txt", "utf8");
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const frame = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
const world = (page) =>
  page.evaluate(
    (key) => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      pixels: document.querySelector("#world").toDataURL(),
      save: localStorage.getItem(key),
    }),
    SAVE_KEY,
  );

async function departure(page, touch = false) {
  await page.goto("/");
  await page.bringToFront();
  await clickOrTap(page.getByRole("button", { name: "灯りをともす" }), touch);
  await page.locator("#seed").fill("HANDING-ON-A-LIGHT");
  await clickOrTap(
    page.getByRole("button", { name: "この灯りで出発する" }),
    touch,
  );
  await expect(page.locator(".first-help")).toBeVisible();
  await frame(page);
  await clickOrTap(
    page.getByRole("button", { name: "最初のひと針へ →" }),
    touch,
  );
  await clickOrTap(
    page.getByRole("button", { name: "一時停止", exact: true }),
    touch,
  );
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  await frame(page);
  await clickOrTap(
    page.getByRole("button", { name: "設定", exact: true }),
    touch,
  );
  await expect(page.getByRole("heading", { name: "灯りの調整" })).toBeVisible();
  await page.locator("#music-volume").fill("0.4");
  await frame(page);
}

async function fullNotices(page) {
  await expect(page.locator(".credits-notices")).toHaveText(notices);
  expect(await page.locator(".credits-notices").textContent()).toBe(notices);
  await expect(page.locator(".credits-notices")).not.toHaveAttribute("role");
  await expect(page.locator(".credits-notice-status")).toHaveText(
    "表記を読み込みました。",
  );
}

async function frozen(page, before) {
  const body = await page.locator("body").innerText();
  await page.waitForTimeout(350);
  expect(await world(page)).toEqual(before);
  expect(await page.locator("body").innerText()).toBe(body);
}

async function footerFits(page) {
  const rows = await page.locator(".panel-footer button").evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return {
        text: node.textContent,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        viewport: { width: innerWidth, height: innerHeight },
      };
    }),
  );
  for (const r of rows) {
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(r.viewport.width);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(r.viewport.height);
  }
  return rows;
}

test("作品情報と全権利表記を五画面で読み、航路と設定・公開保存を保つ", async ({
  page,
}, info) => {
  const errors = [],
    rows = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await departure(page);
  const original = await world(page);
  await page.getByRole("button", { name: "この作品について" }).click();
  await expect(
    page.getByRole("heading", { name: "この灯りについて" }),
  ).toBeVisible();
  await expect(page.locator(".credits-version")).toHaveText(
    `ブラウザ版 v${version}`,
  );
  await expect(page.locator(".credits-about")).toContainText(
    "この灯りを織ってくれて、ありがとう。",
  );
  for (const size of [
    { width: 1200, height: 850 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await frame(page);
    rows.push({ size, footer: await footerFits(page) });
    await frozen(page, original);
    if (size.width === 640)
      await page.screenshot({
        path: `${assets}/handoff-about-${info.project.name}.png`,
      });
  }
  await page
    .getByRole("button", { name: "使用ソフトウェアの表記", exact: true })
    .click();
  await fullNotices(page);
  expect(
    await page
      .locator(".credits-notices")
      .evaluate((node) => getComputedStyle(node).fontSize),
  ).toBe("12px");
  await footerFits(page);
  await frozen(page, original);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".credits-notices")).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => page.locator(".panel-content").evaluate((n) => n.scrollTop))
    .toBeGreaterThan(30);
  await frozen(page, original);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "この灯りについて" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "灯りの調整" })).toBeVisible();
  await frame(page);
  await frozen(page, original);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "記録を書き出す" }).click();
  const bytes = await readFile(await (await download).path());
  expect(JSON.parse(bytes).profile).toEqual(
    prepareImport(original.save).profile,
  );
  expect((await world(page)).save).toBe(original.save);
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  expect(await world(page)).toEqual(original);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/handoff-about-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Public fresh departure; keyboard/click info, exact full local notices with actual Tab/PageDown scrolling and short live status, five viewports with real native frame waits, full 350ms paused Game/PNG/body/raw-save, settings return and real normalized public export. No profile/actor/clock/RNG injection.",
        rows,
        noticesSha256: sha(notices),
        fullWorldAndRawSaveExact: true,
        normalizedPublicExportExact: true,
        nativeKeyboardScroll: true,
        errors,
      },
      null,
      2,
    ),
  );
});

test("本当のタップと標準パッドで作品情報を開き、読む・戻る・停止を保つ", async ({
  browser,
  browserName,
}, info) => {
  const errors = [],
    rows = [];
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await departure(page, true);
  const original = await world(page);
  await page.getByRole("button", { name: "この作品について" }).tap();
  await footerFits(page);
  await frozen(page, original);
  await page
    .getByRole("button", { name: "使用ソフトウェアの表記", exact: true })
    .tap();
  await fullNotices(page);
  await footerFits(page);
  await frozen(page, original);
  await page.getByRole("button", { name: "作品についてへ戻る" }).tap();
  await page.getByRole("button", { name: "設定へ戻る", exact: true }).tap();
  rows.push({
    device: "touch",
    fullWorldAndRawSaveExact:
      JSON.stringify(await world(page)) === JSON.stringify(original),
  });
  expect(await world(page)).toEqual(original);
  await page.evaluate(() => {
    window.__creditsPad = {
      mapping: "standard",
      connected: true,
      index: 0,
      id: "Standard credits test pad",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [window.__creditsPad],
    });
  });
  await frame(page);
  const press = async (index) => {
    await page.evaluate((i) => {
      window.__creditsPad.buttons[i] = { pressed: true, value: 1 };
    }, index);
    await frame(page);
    await page.evaluate((i) => {
      window.__creditsPad.buttons[i] = { pressed: false, value: 0 };
    }, index);
    await frame(page);
  };
  await press(12);
  await expect(
    page.getByRole("button", { name: "この作品について" }),
  ).toBeFocused();
  await press(0);
  await expect(
    page.getByRole("heading", { name: "この灯りについて" }),
  ).toBeVisible();
  await press(12);
  await expect(
    page.getByRole("button", { name: "使用ソフトウェアの表記", exact: true }),
  ).toBeFocused();
  await press(0);
  await fullNotices(page);
  await page.evaluate(() => {
    window.__creditsPad.axes[3] = 1;
  });
  await expect
    .poll(() =>
      page.locator(".panel-content").evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(30);
  await page.evaluate(() => {
    window.__creditsPad.axes[3] = 0;
  });
  await frame(page);
  await frozen(page, original);
  await press(1);
  await expect(
    page.getByRole("heading", { name: "この灯りについて" }),
  ).toBeVisible();
  await press(1);
  await expect(page.getByRole("heading", { name: "灯りの調整" })).toBeVisible();
  await press(1);
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  expect(await world(page)).toEqual(original);
  rows.push({
    device: "standard-pad-api",
    actualMenuConfirmScrollAndBack: true,
    fullWorldAndRawSaveExact: true,
  });
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/handoff-input-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Real browser touch followed by prepared standard Gamepad API button/axis values, actual native frame polling/menu handling, public fresh departure pause. No profile/actor/clock/RNG injection; not a physical controller/device test.",
        rows,
        errors,
      },
      null,
      2,
    ),
  );
  await context.close();
});

test("表記の読込失敗と遅い返事が航路を変えず、開き直して読める", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await departure(page);
  const original = await world(page);
  await page.getByRole("button", { name: "この作品について" }).click();
  await page.route("**/THIRD-PARTY-NOTICES.txt", (route) =>
    route.fulfill({ status: 503, body: "temporarily unavailable" }),
  );
  await page
    .getByRole("button", { name: "使用ソフトウェアの表記", exact: true })
    .click();
  await expect(page.locator(".credits-notices")).toContainText(
    "読み込めませんでした",
  );
  await frozen(page, original);
  await page.getByRole("button", { name: "作品についてへ戻る" }).click();
  await page.unroute("**/THIRD-PARTY-NOTICES.txt");
  let respond;
  const request = new Promise((resolve) => {
    respond = resolve;
  });
  await page.route("**/THIRD-PARTY-NOTICES.txt", async (route) => {
    respond(route);
  });
  await page
    .getByRole("button", { name: "使用ソフトウェアの表記", exact: true })
    .click();
  const delayed = await request;
  await expect(page.locator(".credits-notices")).toContainText(
    "読み込んでいます",
  );
  await page.getByRole("button", { name: "作品についてへ戻る" }).click();
  const body = await page.locator("body").innerText();
  await delayed.fulfill({
    status: 200,
    contentType: "text/plain",
    body: notices,
  });
  await page.waitForTimeout(350);
  expect(await page.locator("body").innerText()).toBe(body);
  expect(await world(page)).toEqual(original);
  await page.unroute("**/THIRD-PARTY-NOTICES.txt");
  await page
    .getByRole("button", { name: "使用ソフトウェアの表記", exact: true })
    .click();
  await fullNotices(page);
  await frozen(page, original);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/handoff-notices-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Prepared only the local notices HTTP responses (503, delayed 200, then the real local file). Public departure and native navigation; stale result cannot replace a closed dialog. Whole paused Game/PNG/body/raw save retained; no game/profile/clock/RNG injection.",
        failureRecoverable: true,
        closedDialogUnaffectedByLateReply: true,
        noticesWholeTextExact: true,
        fullWorldAndRawSaveExact: true,
        errors,
      },
      null,
      2,
    ),
  );
});
