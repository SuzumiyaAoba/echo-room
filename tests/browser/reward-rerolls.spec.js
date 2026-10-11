import { artifacts as artifacts } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Game, createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";
import { canChooseStory } from "../../src/story.js";

function pendingProfile() {
  const p = freshProfile();
  p.attempts = 2;
  p.run = createRun("REROLL-BROWSER");
  Object.assign(p.run, {
    stage: 1,
    checkpoint: "reward",
    scrap: 100,
    hp: 73,
    kills: 7,
    time: 13,
  });
  return p;
}
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
const cards = (page) => page.locator('[data-action="upgrade"]');
const reroll = (page) => page.locator('[data-action="rerollreward"]');
async function ids(page) {
  return cards(page).evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
}
async function savedRun(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).run,
    SAVE_KEY,
  );
}
async function resume(page) {
  await page.reload();
  await page.locator('[data-action="continue"]').click();
}

test("予告した一枚を残して候補を織り直し、費用と二回の上限を再開後にも保つ", async ({
  page,
  browser,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, pendingProfile());
  await expect(cards(page)).toHaveCount(3);
  const promised = await page.locator(".card.promised").getAttribute("data-id");
  const initial = await ids(page);
  await expect(reroll(page)).toHaveText("織り直す / 歯車 12");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/reroll-before.png` });
  await reroll(page).click();
  const once = await ids(page);
  expect(once).toContain(promised);
  expect(
    once.filter((id) => id !== promised).every((id) => !initial.includes(id)),
  ).toBe(true);
  const settled = await savedRun(page);
  expect(settled).toMatchObject({
    checkpoint: "reward",
    rewardRoll: 1,
    scrap: 88,
    hp: 73,
    kills: 7,
    time: 13,
  });
  // Carry the actual exported pending selection to an isolated browser profile.
  await page.reload();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const record = await readFile(await (await exported).path(), "utf8");
  expect(JSON.parse(record).profile.run).toEqual(settled);
  const transferred = await browser.newContext();
  try {
    const other = await transferred.newPage();
    await other.goto("/");
    await other.getByRole("button", { name: "設定", exact: true }).click();
    await other.locator("#save-file").setInputFiles({
      name: "echo-loom-pending-reward.json",
      mimeType: "application/json",
      buffer: Buffer.from(record),
    });
    await expect(other.locator(".import-summary")).toContainText(
      "織片を選ぶところ",
    );
    await other
      .getByRole("button", { name: "記録を取り込む", exact: true })
      .click();
    await resume(other);
    expect(await ids(other)).toEqual(once);
    expect(await savedRun(other)).toEqual(settled);
    await expect(reroll(other)).toHaveText("織り直す / 歯車 20");
  } finally {
    await transferred.close();
  }
  await page.bringToFront();
  await resume(page);
  expect(await ids(page)).toEqual(once);
  expect(await savedRun(page)).toEqual(settled);
  expect(await page.evaluate(() => window.__ECHO_LOOM__.snapshot().mode)).toBe(
    "reward",
  );
  await expect(reroll(page)).toHaveText("織り直す / 歯車 20");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/reroll-after-resume.png` });
  await reroll(page).click();
  expect(await savedRun(page)).toMatchObject({ rewardRoll: 2, scrap: 68 });
  await expect(reroll(page)).toBeDisabled();
  await resume(page);
  await expect(reroll(page)).toBeDisabled();
  await page.locator(`[data-action="upgrade"][data-id="${promised}"]`).click();
  await resume(page);
  const completed = await savedRun(page);
  expect(completed.checkpoint).toBe("cleared");
  expect(completed.upgrades[promised]).toBe(1);
  expect(completed.scrap).toBe(68);
  await expect(cards(page)).toHaveCount(0);
  // Only positioning in the already cleared room is a diagnostic shortcut.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 240;
    g.player.y = 43;
  });
  await page.keyboard.press("KeyE");
  await page.locator('[data-action="route"][data-id="rest"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.rewardRoll),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test("強敵の宝庫の歯車とレア織片を保ち、選択途中の再開で追加報酬を重ねない", async ({
  page,
}) => {
  const p = pendingProfile();
  Object.assign(p.run, { stage: 5, checkpoint: "cleared", scrap: 10, hp: 50 });
  await open(page, p);
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 240;
    g.player.y = 43;
  });
  await page.keyboard.press("KeyE");
  await page.locator('[data-action="route"][data-id="salvage"]').click();
  // Isolate settlement using the real death/clear handlers. This does not
  // establish difficulty or combat skill; production has a separate pilot.
  const expectedScrap = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    for (const next of g.spawnQueue)
      g.spawn(next.kind, next.x, next.y, next.elite);
    g.spawnQueue = [];
    for (const enemy of [...g.enemies])
      g.damageEnemy(enemy, enemy.hp, "thread");
    return (
      g.run.scrap +
      g.pickups
        .filter((p) => p.kind === "scrap")
        .reduce((sum, p) => sum + p.amount, 0) +
      35
    );
  });
  await expect(cards(page)).toHaveCount(3);
  expect((await savedRun(page)).scrap).toBe(expectedScrap);
  await reroll(page).click();
  const once = await savedRun(page);
  expect(once.scrap).toBe(expectedScrap - 12);
  expect(once.hp).toBe(50);
  expect(
    await page
      .locator('[data-action="upgrade"].rare,[data-action="upgrade"].legendary')
      .count(),
  ).toBeGreaterThan(0);
  const offered = await ids(page);
  await resume(page);
  expect(await savedRun(page)).toEqual(once);
  expect(await ids(page)).toEqual(offered);
  await page.locator('[data-action="skipreward"]').click();
  await resume(page);
  expect(await savedRun(page)).toMatchObject({
    checkpoint: "cleared",
    scrap: expectedScrap - 12,
    hp: 50,
  });
});

test("物語で得た織片の選択を再開し、対価や街へ届ける記憶を繰り返さない", async ({
  page,
}) => {
  const p = pendingProfile();
  Object.assign(p.run, { stage: 2, checkpoint: "entry", hp: 100, journal: [] });
  let index;
  for (let seed = 0; seed < 30; seed++) {
    p.run.seed = `STORY-REROLL-${seed}`;
    const g = new Game(structuredClone(p.run));
    index = g.event.choices.findIndex(
      (c) => c.offer && canChooseStory(g.run, c),
    );
    if (index >= 0) break;
  }
  expect(index).toBeGreaterThanOrEqual(0);
  await open(page, p);
  await page.locator(`[data-action="event"][data-id="${index}"]`).click();
  await page.locator('[data-action="storycontinue"]').click();
  await expect(cards(page)).toHaveCount(3);
  const before = await savedRun(page);
  expect(before.journal).toHaveLength(1);
  await reroll(page).click();
  const after = await savedRun(page);
  expect(after.scrap).toBe(before.scrap - 12);
  expect(after.hp).toBe(before.hp);
  expect(after.memory).toBe(before.memory);
  expect(after.journal).toEqual(before.journal);
  const offered = await ids(page);
  await resume(page);
  expect(await ids(page)).toEqual(offered);
  expect(await savedRun(page)).toEqual(after);
  await expect(page.locator('[data-action="event"]')).toHaveCount(0);
});

test("横向きタッチ画面で費用を読み、候補を入れ替えて約束の一枚を選べる", async ({
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
    await open(page, pendingProfile());
    const promised = await page
      .locator(".card.promised")
      .getAttribute("data-id");
    await reroll(page).scrollIntoViewIfNeeded();
    await expect(reroll(page)).toBeInViewport();
    expect(
      await page
        .locator(".panel")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page
        .locator(".reward-tools")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page
        .locator(".panel-content")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    let box = await reroll(page).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest("[data-action]")?.dataset
            .action,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ),
    ).toBe("rerollreward");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect(await savedRun(page)).toMatchObject({ rewardRoll: 1, scrap: 88 });
    await reroll(page).scrollIntoViewIfNeeded();
    if (browserName === "chromium")
      await page.screenshot({ path: `${artifacts}/reroll-touch.png` });
    const chosen = page.locator(
      `[data-action="upgrade"][data-id="${promised}"]`,
    );
    await chosen.scrollIntoViewIfNeeded();
    box = await chosen.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect((await savedRun(page)).upgrades[promised]).toBe(1);
    await expect(cards(page)).toHaveCount(0);
  } finally {
    await context.close();
  }
});
