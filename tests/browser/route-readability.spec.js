import { fixturePath } from "./artifacts.js";
import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createRun, forecastRoom, Game } from "../../src/game.js";
import { freshProfile, exportProfile, SAVE_KEY } from "../../src/save.js";

async function importProfile(page, profile) {
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "route-record.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportProfile(profile)),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
}
async function prepared(page, next, open = true) {
  const p = freshProfile();
  p.attempts = 1;
  p.run = createRun("TACTIC-1");
  Object.assign(p.run, {
    stage: next - 1,
    checkpoint: open ? "reward" : "cleared",
  });
  await importProfile(page, p);
  if (open) {
    // Select an actual offered reward so the native completion notices are fresh.
    await page.locator('[data-action="upgrade"]').first().click();
    await openPrepared(page);
  }
  return page.evaluate(() => structuredClone(window.__ECHO_LOOM__.game().run));
}
async function openPrepared(page) {
  // A prepared menu fixture: only movement to the cleared room exit is diagnostic.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 240;
    g.player.y = 43;
  });
  await page.keyboard.press("KeyE");
  await expect(page.locator('[data-action="route"]')).toHaveCount(3);
}
const frozen = (page) =>
  page.evaluate(() => ({
    game: JSON.stringify(window.__ECHO_LOOM__.game()),
    pixels: document.querySelector("#world").toDataURL(),
    stored: JSON.stringify(localStorage),
    labels: [...document.querySelectorAll(".route-card")].map(
      (n) => n.innerText,
    ),
  }));
const metric = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      p = el.closest(".panel-content").getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      panelTop: p.top,
      panelBottom: p.bottom,
      inside: r.top >= p.top && r.bottom <= p.bottom,
      font: parseFloat(getComputedStyle(el).fontSize),
      target: document
        .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        ?.closest('[data-action="route"]')?.dataset.id,
    };
  });

test("実戦から得た休息後の分岐で三構成と報酬を初期表示に読み、TabとEnterで選ぶ", async ({
  page,
}, info) => {
  const profile = JSON.parse(
    await readFile(fixturePath("forks-earned-rest-entry.json"), "utf8"),
  );
  expect(profile.run.stage).toBe(18);
  expect(profile.run.checkpoint).toBe("cleared");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await importProfile(page, profile);
  // Actual movement from a genuinely earned checkpoint, without an exit teleport.
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2500);
  await page.keyboard.up("KeyW");
  await page.keyboard.press("KeyE");
  await expect(page.locator('[data-action="route"]')).toHaveCount(3);
  expect(
    await page.locator(".panel-content").evaluate((el) => el.scrollTop),
  ).toBe(0);
  const rows = [];
  for (const route of ["loom", "salvage", "rest"]) {
    const card = page.locator('[data-action="route"][data-id="' + route + '"]');
    const f = forecastRoom(profile.run, 19, route);
    await expect(card.locator(".route-tactic")).toHaveText(f.encounter.name);
    await expect(card.locator(".route-tactic-hint")).toHaveText(
      f.encounter.hint,
    );
    await expect(card.locator(".route-encounter")).toContainText(
      "敵 " + f.total + "体",
    );
    const fields = {};
    for (const [key, selector] of [
      ["name", "h3"],
      ["tactic", ".route-tactic"],
      ["hint", ".route-tactic-hint"],
      ["count", ".route-encounter strong:last-of-type"],
      ["reward", ".detail"],
    ]) {
      fields[key] = await metric(card.locator(selector));
      expect(fields[key].inside).toBe(true);
      expect(fields[key].target).toBe(route);
    }
    expect(fields.hint.font).toBeGreaterThanOrEqual(10);
    expect(fields.reward.font).toBeGreaterThanOrEqual(10);
    rows.push({ route, encounter: f.encounter, fields });
  }
  await page.screenshot({
    path: assets + "/forks-desktop-" + info.project.name + ".png",
  });
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
  let tabs = 0;
  while (
    (await page.evaluate(
      () => document.activeElement?.dataset?.id !== "rest",
    )) &&
    tabs < 8
  ) {
    await page.keyboard.press("Tab");
    tabs++;
  }
  expect(await page.evaluate(() => document.activeElement?.dataset?.id)).toBe(
    "rest",
  );
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement?.dataset?.action),
  ).toBe("resume");
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement?.dataset?.id)).toBe(
    "rest",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const actual = await page.evaluate(() => ({
    run: structuredClone(window.__ECHO_LOOM__.game().run),
    encounter: structuredClone(window.__ECHO_LOOM__.game().encounter),
  }));
  expect(actual.run.stage).toBe(19);
  expect(actual.run.route).toBe("rest");
  expect(actual.encounter).toEqual(
    forecastRoom(profile.run, 19, "rest").encounter,
  );
  expect(errors).toEqual([]);
  await writeFile(
    assets + "/forks-earned-" + info.project.name + ".json",
    JSON.stringify(
      {
        scope:
          "Public import of unchanged actual stage-18 rest checkpoint, native W/E, initial unscrolled three-card visibility, exact 350ms Game/pixels/storage/labels, native Tab and Enter selection. No synthetic clear or combat mutations.",
        rows,
        tabs,
        pauseExact: true,
        actual,
        errors,
      },
      null,
      2,
    ),
  );
});

test("四つの小画面で対処と報酬を読み、通常通知に遮られず実タップする", async ({
  browser,
}, info) => {
  const sizes = [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ];
  const rows = [];
  for (const [index, viewport] of sizes.entries()) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    try {
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const next = [1, 9, 17, 4][index],
        route = ["loom", "salvage", "rest", "loom"][index];
      const run = await prepared(page, next);
      const notices = await page
        .locator(".toast:not(.toast-important)")
        .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).display));
      expect(notices.length).toBeGreaterThan(0);
      expect(notices.every((s) => s === "none")).toBe(true);
      const card = page.locator(
        '[data-action="route"][data-id="' + route + '"]',
      );
      const hint = card.locator(".route-tactic-hint");
      await hint.scrollIntoViewIfNeeded();
      const view = await metric(hint);
      expect(view.inside).toBe(true);
      expect(view.font).toBeGreaterThanOrEqual(10);
      expect(view.target).toBe(route);
      const action = card.locator(index % 2 ? ".route-tactic" : ".detail");
      await action.scrollIntoViewIfNeeded();
      const target = await metric(action);
      expect(target.inside).toBe(true);
      expect(target.target).toBe(route);
      expect(target.font).toBeGreaterThanOrEqual(10);
      expect(
        await page
          .locator(".panel")
          .evaluate((n) => n.scrollWidth <= n.clientWidth),
      ).toBe(true);
      const expected = new Game({ ...structuredClone(run), stage: next, route })
        .spawnQueue;
      const box = await action.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.keyboard.press("Escape");
      const actual = await page.evaluate(() => ({
        run: structuredClone(window.__ECHO_LOOM__.game().run),
        queue: structuredClone(window.__ECHO_LOOM__.game().spawnQueue),
      }));
      expect(actual.run.stage).toBe(next);
      expect(actual.run.route).toBe(route);
      expect(actual.queue).toEqual(expected);
      expect(errors).toEqual([]);
      rows.push({
        viewport,
        next,
        route,
        view,
        target,
        noticesHidden: true,
        queueExact: true,
        errors,
      });
    } finally {
      await context.close();
    }
  }
  await writeFile(
    assets + "/forks-touch-" + info.project.name + ".json",
    JSON.stringify(
      {
        scope:
          "Prepared cleared-room fixtures through public import and diagnostic exit positioning. Native touch choice at each viewport; this is not an earned expedition.",
        rows,
      },
      null,
      2,
    ),
  );
});

test("保存に失敗した重要な通知は分岐でも見える", async ({ page }, info) => {
  await prepared(page, 1, false);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException("Test quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
  }, SAVE_KEY);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.locator('[data-action="continue"]').click();
  await openPrepared(page);
  const urgent = page.locator(".toast-important");
  await expect(urgent).toContainText("保存領域に書き込めません");
  await expect(urgent).toBeVisible();
  const notice = await urgent.evaluate((el) => ({
    text: el.textContent,
    display: getComputedStyle(el).display,
    visibility: getComputedStyle(el).visibility,
  }));
  expect(notice.display).not.toBe("none");
  expect(notice.visibility).toBe("visible");
  await writeFile(
    assets + "/forks-important-" + info.project.name + ".json",
    JSON.stringify(
      {
        scope:
          "Prepared cleared-room public import, injected storage quota failure only, native save-home and resume; actual persistence failure notification remains visible on the route dialog.",
        notice,
      },
      null,
      2,
    ),
  );
});
