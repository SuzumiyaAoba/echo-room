import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  freshProfile,
  SAVE_KEY,
  RECOVERY_KEY,
  exportProfile,
} from "../../src/save.js";
import { createRun } from "../../src/game.js";
import { CITY_MEMORIES } from "../../src/story.js";

const artifacts = ".mdxr/20261007195700-echo-loom/assets";
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const importedProfile = () => {
  const p = freshProfile();
  Object.assign(p, {
    memory: 108,
    attempts: 9,
    victories: 1,
    best: 24,
    totalKills: 302,
  });
  p.unlocked.push("scatter", "bell");
  p.remembered = CITY_MEMORIES.filter((m) => m.project === "dock").map(
    (m) => m.key,
  );
  p.settings.music = 0.1;
  p.run = createRun("KEEP-THIS-LIGHT", "scatter", "bell");
  Object.assign(p.run, { stage: 5, checkpoint: "cleared", hp: 67 });
  p.run.beacons = [3, 4];
  p.run.repairs = [1, 4];
  p.run.journal = [{ id: "bottle", choice: "deliver", stage: 2 }];
  return p;
};
async function file(page, text) {
  await page.locator("#save-file").setInputFiles({
    name: "echo-loom-record.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
}

test("実際に書き出した記録を確認・取り消し・取り込みし、再起動後にも元へ戻せる", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const p = importedProfile();
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: p },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const download = await exported;
  expect(download.suggestedFilename()).toMatch(/^echo-loom-.*\.json$/);
  const text = await readFile(await download.path(), "utf8");
  expect(JSON.parse(text).profile.run.seed).toBe("KEEP-THIS-LIGHT");
  const current = freshProfile();
  current.memory = 37;
  // Seed the next page after the old page's normal pagehide save has finished.
  await page.evaluate(
    (value) => sessionStorage.setItem("next-profile", JSON.stringify(value)),
    current,
  );
  await page.addInitScript((key) => {
    const next = sessionStorage.getItem("next-profile");
    if (next) {
      localStorage.setItem(key, next);
      sessionStorage.removeItem("next-profile");
    }
  }, SAVE_KEY);
  await page.reload();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await file(page, text);
  await expect(
    page.getByRole("heading", { name: "この記録を取り込む", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".import-summary")).toContainText(
    "KEEP-THIS-LIGHT",
  );
  await expect(page.locator(".import-summary")).toContainText("6 / 24部屋");
  expect((await stored(page)).memory).toBe(37);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/save-import.png` });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "灯りの調整" })).toBeVisible();
  expect((await stored(page)).memory).toBe(37);
  await file(page, "{broken");
  await expect(page.locator("#save-status")).toContainText(
    "ファイルを読めませんでした",
  );
  expect((await stored(page)).memory).toBe(37);
  await file(page, text);
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "航路を続ける" }),
  ).toBeVisible();
  expect((await stored(page)).memory).toBe(108);
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().mode))
    .toBe("cleared");
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.hp),
  ).toBe(67);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.locator("#music-volume")).toHaveValue("0.1");
  await expect(
    page.getByRole("button", { name: "記録を取り込む", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "記録を書き出す", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("button", { name: "直前の取り込みを戻す" }).click();
  await expect(page.locator(".import-summary")).toContainText("37");
  await page.getByRole("button", { name: "この記録へ戻す" }).click();
  await expect(
    page.getByRole("button", { name: "灯りをともす" }),
  ).toBeVisible();
  await page.reload();
  expect((await stored(page)).memory).toBe(37);
  expect((await stored(page)).run).toBeNull();
  expect(errors).toEqual([]);
});

test("主記録の破損を知らせ、直前の航路から再開できる", async ({ page }) => {
  await page.addInitScript(
    ({ main, spare, value }) => {
      if (!sessionStorage.getItem("corruption-seeded")) {
        localStorage.setItem(main, "{broken");
        localStorage.setItem(spare, JSON.stringify(value));
        sessionStorage.setItem("corruption-seeded", "true");
      }
    },
    { main: SAVE_KEY, spare: RECOVERY_KEY, value: importedProfile() },
  );
  await page.goto("/");
  await expect(page.locator(".toast")).toContainText(
    "直前の記録から復元しました",
  );
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const snapshot = await page.evaluate(() => window.__ECHO_LOOM__.snapshot());
  expect(snapshot.run.seed).toBe("KEEP-THIS-LIGHT");
  expect(snapshot.mode).toBe("cleared");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  expect((await stored(page)).run.seed).toBe("KEEP-THIS-LIGHT");
  await expect(page.locator(".toast")).toHaveCount(0);
});

test("保存領域を使えないブラウザでも取り込み・書き出し・取り消しができる", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw Error("blocked");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.locator(".save-tools")).toContainText(
    "このブラウザには保存できません",
  );
  await file(page, exportProfile(importedProfile()));
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "航路を続ける" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const text = await readFile(await (await exported).path(), "utf8");
  expect(JSON.parse(text).profile.memory).toBe(108);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/save-settings.png` });
  await page.getByRole("button", { name: "直前の取り込みを戻す" }).click();
  await page.getByRole("button", { name: "この記録へ戻す" }).click();
  await expect(
    page.getByRole("button", { name: "灯りをともす" }),
  ).toBeVisible();
});

test("別タブの取り込みを古いタブが上書きせず、残す記録を選べる", async ({
  page,
}, info) => {
  const original = freshProfile();
  original.memory = 37;
  original.attempts = 2;
  original.run = createRun("THE-OLDER-LIGHT");
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: original },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const other = await page.context().newPage();
  const closing = await page.context().newPage();
  await closing.goto("/");
  await other.goto("/");
  await other.getByRole("button", { name: "設定", exact: true }).click();
  await file(other, exportProfile(importedProfile()));
  await other
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "二つの灯りの記録" }),
  ).toBeVisible();
  await expect(page.locator(".save-comparison")).toContainText(
    "THE-OLDER-LIGHT",
  );
  await expect(page.locator(".save-comparison")).toContainText(
    "KEEP-THIS-LIGHT",
  );
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().paused),
  ).toBe(true);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/save-conflict.png` });
  await closing.close();
  expect((await stored(other)).memory).toBe(108);
  await page.getByRole("button", { name: "別のタブの記録を開く" }).click();
  await expect(
    page.getByRole("button", { name: "航路を続ける" }),
  ).toBeVisible();
  await other.getByRole("button", { name: "設定", exact: true }).click();
  await other.locator("#music-volume").fill("0.2");
  await expect(
    page.getByRole("heading", { name: "二つの灯りの記録" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "このタブの記録を残す" }).click();
  await expect(
    other.getByRole("heading", { name: "二つの灯りの記録" }),
  ).toBeVisible();
  await other.close();
  await page.reload();
  expect((await stored(page)).memory).toBe(108);
  expect((await stored(page)).settings.music).toBe(0.1);
  await expect(
    page.getByRole("button", { name: "航路を続ける" }),
  ).toBeVisible();
});

test("帰還後のもう一周は装備・織片・難易度を引き継ぎ、航路番号を新しくする", async ({
  page,
}) => {
  const p = importedProfile();
  Object.assign(p.run, {
    stage: 0,
    checkpoint: "entry",
    difficulty: 1,
    startingFragment: "wide",
    upgrades: { wide: 1 },
    beacons: [],
    repairs: [],
    journal: [],
  });
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: SAVE_KEY, value: p },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.invulnerable = 0;
    g.hurt(500, { x: g.player.x - 10, y: g.player.y });
  });
  await expect(
    page.getByRole("heading", { name: "灯りは、またともる" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "もう一度、織る" }).click();
  await expect(
    page.locator('[data-action="weapon"][data-id="scatter"]'),
  ).toHaveClass(/selected/);
  await expect(
    page.locator('[data-action="relic"][data-id="bell"]'),
  ).toHaveClass(/selected/);
  await expect(
    page.locator('[data-action="difficulty"][data-id="1"]'),
  ).toHaveClass(/selected/);
  await expect(
    page.locator('[data-action="fragment"][data-id="wide"]'),
  ).toHaveClass(/selected/);
  await expect(page.locator("#seed")).toHaveValue("");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  const run = await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run);
  expect(run.weapon).toBe("scatter");
  expect(run.relic).toBe("bell");
  expect(run.difficulty).toBe(1);
  expect(run.startingFragment).toBe("wide");
  expect(run.upgrades.wide).toBe(1);
  expect(run.seed).not.toBe("KEEP-THIS-LIGHT");
});
