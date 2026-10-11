import { artifacts as artifact } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";
import { CITY_MEMORIES } from "../../src/story.js";

async function load(page, profile) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: profile },
  );
  await page.goto("/");
}
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);

test("物語の選択が保存され、倒れて帰還しても街の修復と最初の織片が残る", async ({
  page,
}, info) => {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.remembered = ["keeper:ferryman", "beacon:3", "beacon:4", "repair:1"];
  profile.run = createRun("BROWSER-LETTER");
  profile.run.stage = 2;
  profile.run.hp = 60;
  profile.run.scrap = 40;
  await load(page, profile);
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator('[data-action="event"]')).toHaveCount(3);
  const chosen = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game(),
      index = g.event.choices.findIndex((c) => c.help);
    return { index, id: g.event.id, choice: g.event.choices[index] };
  });
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifact}/story-choice.png` });
  await page.locator('[data-action="event"]').nth(chosen.index).click();
  await expect(page.locator(".story-gift")).toContainText("帰り舟の桟橋");
  await expect(page.locator(".event-copy")).toHaveText(chosen.choice.result);
  expect((await saved(page)).remembered).toHaveLength(4);
  await page.locator('[data-action="storycontinue"]').click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  const snapshot = await page.evaluate(() => window.__ECHO_LOOM__.snapshot());
  expect(snapshot.mode).toBe("cleared");
  expect(snapshot.run.journal).toEqual([
    { id: chosen.id, choice: chosen.choice.id, stage: 2 },
  ]);
  expect(snapshot.run.scrap).toBe(40 - (chosen.choice.costScrap || 0));
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.mode = "combat";
    g.player.invulnerable = 0;
    g.hurt(500, { x: g.player.x - 10, y: g.player.y });
  });
  await expect(
    page.getByRole("heading", { name: "灯りは、またともる" }),
  ).toBeVisible();
  await expect(page.locator(".return-gifts")).toContainText(
    "帰り舟の桟橋を修復しました",
  );
  await page.getByRole("button", { name: "灯台へ帰る", exact: true }).click();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifact}/home-repaired-night.png` });
  await page.getByRole("button", { name: "街を織り直す", exact: true }).click();
  await expect(page.locator(".city-project").first()).toContainText(
    "5 / 5 記憶 · 修復済み",
  );
  await page.locator('[data-action="citydetail"]').first().click();
  await expect(page.locator(".city-ledger").first()).toBeVisible();
  await page.locator('[data-action="citydetail"]').first().click();
  await expect(page.locator(".city-ledger").first()).toBeHidden();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifact}/city-progress.png` });
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await expect(
    page.locator('[data-action="fragment"][data-id="wide"]'),
  ).toBeEnabled();
  await expect(
    page.locator('[data-action="fragment"][data-id="suture"]'),
  ).toBeDisabled();
  await page.locator('[data-action="fragment"][data-id="wide"]').click();
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.startingFragment),
    )
    .toBe("wide");
  expect(
    await page.evaluate(
      () => window.__ECHO_LOOM__.snapshot().run.upgrades.wide,
    ),
  ).toBe(1);
  const stored = await saved(page);
  expect(stored.remembered).toHaveLength(5);
  expect(stored.stories).toContain(`${chosen.id}:${chosen.choice.id}`);
});

test("街の声の結末と朝が保存され、今日の航路は持ち出しなしで始まる", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const profile = freshProfile();
  profile.attempts = 2;
  profile.remembered = CITY_MEMORIES.map((m) => m.key);
  profile.run = createRun("BROWSER-CHORUS");
  profile.run.stage = 23;
  profile.run.beacons = [3, 11, 19];
  profile.run.bosses = ["ferryman", "gardener"];
  await load(page, profile);
  await page.locator('[data-action="continue"]').click();
  await page.bringToFront();
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    for (const next of g.spawnQueue) g.spawn(next.kind, next.x, next.y);
    g.spawnQueue = [];
    for (const enemy of [...g.enemies])
      g.damageEnemy(enemy, enemy.hp, "thread");
  });
  await expect(
    page.getByRole("heading", { name: "街は、明日を歌う" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "灯台へ帰る", exact: true }).click();
  await expect(page.locator(".art-caption")).toContainText("05:12");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifact}/home-dawn.png` });
  await page.reload();
  await expect(page.locator(".art-caption")).toContainText("05:12");
  expect((await saved(page)).endings).toEqual(["chorus"]);
  await page.getByRole("button", { name: "記憶の書庫" }).click();
  await page.getByRole("button", { name: "届けた手紙", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "街は、明日を歌う" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator('[data-action="fragment"][data-id="wide"]').click();
  await page.locator('[data-action="fragment"][data-id="suture"]').click();
  await expect(page.locator(".starting-fragments .selected")).toHaveCount(1);
  await page.getByRole("button", { name: "今日の航路", exact: true }).click();
  const run = await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run);
  expect(run.startingFragment).toBeNull();
  expect(run.upgrades).toEqual({});
  expect(run.seed).toMatch(/^DAILY-/);
  expect(errors).toEqual([]);
});

test.describe("小さなタッチ画面の街と支度", () => {
  test.use({ viewport: { width: 800, height: 450 }, hasTouch: true });
  test("街の修復を読み、織片を選んで画面内の出発ボタンを押せる", async ({
    page,
  }, info) => {
    const profile = freshProfile();
    profile.attempts = 2;
    profile.victories = 1;
    profile.remembered = CITY_MEMORIES.map((m) => m.key);
    await load(page, profile);
    await page.getByRole("button", { name: "街を織り直す", exact: true }).tap();
    await expect(page.locator(".city-project")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "灯台へ戻る", exact: true }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "灯台へ戻る", exact: true }).tap();
    await page.getByRole("button", { name: "灯りをともす" }).tap();
    await page.locator('[data-action="fragment"][data-id="quickecho"]').tap();
    await expect(
      page.getByRole("button", { name: "この灯りで出発する" }),
    ).toBeInViewport();
    if (info.project.name === "chromium")
      await page.screenshot({ path: `${artifact}/touch-setup.png` });
    await page.getByRole("button", { name: "この灯りで出発する" }).tap();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__ECHO_LOOM__.snapshot().run.startingFragment,
        ),
      )
      .toBe("quickecho");
  });
});
