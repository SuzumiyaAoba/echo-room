import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createRun } from "../../src/game.js";
import { ENEMIES } from "../../src/content.js";
import { freshProfile, SAVE_KEY, prepareImport } from "../../src/save.js";
import { makeReturnRecord } from "../../src/return-record.js";
import { lastHitReadout } from "../../src/last-impact.js";
const assets = ".mdxr/20261007195700-echo-loom/assets";
const engine = (n) => (n === "webkit" ? "webkit-last-impact" : n);
const proof = (kind, n, data) =>
  writeFile(
    `${assets}/lesson-${kind}-${engine(n)}.json`,
    JSON.stringify(data, null, 2) + "\n",
  );
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
async function importRecord(page, profile) {
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "last-hit.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(profile)),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
}
const sources = [
  ["contact", "crawler"],
  ["charge", "charger"],
  ["projectile", "shooter"],
  ["bloom", "gardener"],
  ["line", "heart"],
  ["cord", "weaver"],
  ["stolen", "weaver"],
  ["tide", null],
  ["gardenShot", null],
  ["furnaceShot", null],
  ["unknown", null],
  ...Object.keys(ENEMIES).map((kind) => ["contact", kind]),
];

test("十一種類と九種類の接触を公開取り込みで読み、数値と対処・保存を保つ", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const rows = [];
  for (const [type, enemy] of sources) {
    const p = freshProfile(),
      run = createRun("LESSON-CATALOG");
    run.stage =
      {
        bloom: 15,
        line: 23,
        cord: 8,
        stolen: 8,
        tide: 2,
        gardenShot: 10,
        furnaceShot: 18,
      }[type] || 0;
    const lastHit = {
      version: 1,
      type,
      enemy,
      elite: !!enemy && !ENEMIES[enemy].boss,
      damage: 17.25,
      hpBefore: 1.1,
    };
    p.lastReturn = makeReturnRecord(run, false, 5, lastHit);
    await importRecord(page, p);
    const before = await saved(page);
    await page.getByRole("button", { name: "直近の旅", exact: true }).click();
    const view = lastHitReadout(lastHit),
      card = page.getByRole("complementary", { name: "最後に受けた一撃" });
    await expect(card).toContainText(view.title);
    await expect(card).toContainText(view.hint);
    await expect(card).toContainText("直前の体力 1.1 · 一撃 17.3");
    expect(await saved(page)).toEqual(before);
    rows.push({
      type,
      enemy,
      title: view.title,
      hint: view.hint,
      saveExact: true,
    });
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
  await proof("catalog", browserName, {
    scope:
      "Twenty explicitly prepared return records imported through the public file input. Eleven attack types and nine enemy contact names; decimal display, code-owned advice and unchanged save. Not natural defeats or expedition results.",
    rows,
    errors,
  });
});

test("新しい旅の自然な敗北を記録し、最後の一撃・350ms停止・四画面と再起動を保つ", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-flashes").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("LESSON-FIRST");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.evaluate(async () => {
    const { ENEMIES } = await import("/src/content.js"),
      g = window.__ECHO_LOOM__.game(),
      Game = g.constructor,
      hurt = Game.prototype.hurt,
      make = Game.prototype.makeBullet;
    const emitters = new WeakMap();
    window.__lessonHits = [];
    Game.prototype.makeBullet = function (...args) {
      const s = args[0],
        enemy = this.enemies.includes(s) ? s.kind : null,
        source = {
          type: "projectile",
          enemy,
          elite: !!enemy && !!s.elite && !ENEMIES[enemy].boss,
        };
      const b = make.apply(this, args);
      emitters.set(b, source);
      return b;
    };
    Game.prototype.hurt = function (...args) {
      const s = args[1],
        before = { hp: this.run.hp, damage: this.run.damageTaken };
      let source = { type: "unknown", enemy: null, elite: false };
      if (this.enemies.includes(s))
        source = {
          type:
            s.state === "charge" && ["charger", "ferryman"].includes(s.kind)
              ? "charge"
              : "contact",
          enemy: s.kind,
          elite: !!s.elite && !ENEMIES[s.kind].boss,
        };
      else if (this.bullets.includes(s))
        source = emitters.get(s) || {
          type: "projectile",
          enemy: null,
          elite: false,
        };
      const result = hurt.apply(this, args);
      if (this.run.damageTaken > before.damage)
        window.__lessonHits.push({
          before,
          source,
          amount: args[0],
          damage: this.run.damageTaken - before.damage,
          hpAfter: this.run.hp,
          mode: this.mode,
          time: this.run.time,
        });
      return result;
    };
  });
  await page
    .getByRole("button", { name: "最初のひと針へ →", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "灯りは、またともる", exact: true })
    .waitFor();
  const actual = await page.evaluate(() => ({
      hits: window.__lessonHits,
      run: structuredClone(window.__ECHO_LOOM__.game().run),
    })),
    fatal = actual.hits.at(-1),
    profile = await saved(page);
  expect(fatal.mode).toBe("dead");
  expect(profile.lastReturn.lastHit).toEqual({
    version: 1,
    ...fatal.source,
    damage: fatal.damage,
    hpBefore: fatal.before.hp,
  });
  expect(profile.lastReturn.run.seed).toBe("LESSON-FIRST");
  expect(profile.lastReturn.run.kills).toBe(0);
  expect(profile.lastReturn.run.echoesCast).toBe(0);
  await page.waitForFunction(() => !document.querySelector(".toast"));
  await page.waitForTimeout(150);
  const frozen = () =>
    page.evaluate(
      (key) => ({
        game: JSON.stringify(window.__ECHO_LOOM__.game()),
        pixels: document.querySelector("#world").toDataURL(),
        body: document.body.innerText,
        save: localStorage.getItem(key),
      }),
      SAVE_KEY,
    );
  const before = await frozen();
  await page.waitForTimeout(350);
  expect(await frozen()).toEqual(before);
  await page.locator(".return-lesson").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${assets}/lesson-after-${engine(browserName)}.png`,
  });
  const displays = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator(".return-lesson").scrollIntoViewIfNeeded();
    const view = await page.locator(".return-lesson").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        fonts: [...el.querySelectorAll("p,h3,strong")].map((e) =>
          parseFloat(getComputedStyle(e).fontSize),
        ),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(view.left).toBeGreaterThanOrEqual(0);
    expect(view.right).toBeLessThanOrEqual(viewport.width);
    expect(view.fonts.every((v) => v >= 10)).toBe(true);
    expect(view.overflow).toBe(false);
    displays.push({ viewport, ...view });
  }
  await page.reload();
  expect(await saved(page)).toEqual(profile);
  await page.getByRole("button", { name: "直近の旅", exact: true }).click();
  await expect(page.locator(".return-lesson")).toContainText(
    lastHitReadout(profile.lastReturn.lastHit).title,
  );
  expect(await saved(page)).toEqual(profile);
  expect(errors).toEqual([]);
  await proof("native", browserName, {
    scope:
      "Fresh public LESSON-FIRST with no movement or shooting. Read-only observers call original makeBullet/hurt exactly once, record emitter arguments independently of the product annotations, and accepted damage only. No combat, HP, queue, RNG, clock or profile writes. Real early defeat, 350 ms full Game/RGBA/body/profile freeze, four display sizes and full profile reload. Not a victory or human fun assessment.",
    ...actual,
    profile,
    pauseExact: true,
    pauseMilliseconds: 350,
    displays,
    reloadExact: true,
    errors,
  });
});

test("旧記録・不正な文章・実ファイルの移行と取り込みの取り消しを保つ", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const baseline = JSON.parse(
      await readFile(`${assets}/lesson-before.json`, "utf8"),
    ),
    old = baseline.profile;
  await importRecord(page, old);
  const oldStored = await saved(page);
  await page.getByRole("button", { name: "直近の旅", exact: true }).click();
  await expect(page.locator(".return-lesson")).toHaveCount(0);
  expect(await saved(page)).toEqual(oldStored);
  await page.keyboard.press("Escape");
  const incoming = structuredClone(old),
    fatal = baseline.hits.at(-1);
  incoming.lastReturn.lastHit = {
    version: 1,
    type: "contact",
    enemy: fatal.source.kind,
    elite: fatal.source.elite,
    damage: fatal.damage,
    hpBefore: fatal.before.hp,
    title: "<img src=x onerror=alert(1)>",
    hint: "fake",
    history: [1],
  };
  const expected = prepareImport(JSON.stringify(incoming)).profile;
  await importRecord(page, incoming);
  expect(await saved(page)).toEqual(expected);
  await page.getByRole("button", { name: "直近の旅", exact: true }).click();
  await expect(page.locator(".return-lesson")).toContainText("潮這いとの接触");
  await expect(page.locator(".return-lesson")).not.toContainText("fake");
  await expect(page.locator('.return-lesson img[src="x"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const bytes = await readFile(await (await pending).path());
  expect(prepareImport(bytes.toString()).profile).toEqual(expected);
  await writeFile(`${assets}/lesson-export-${engine(browserName)}.json`, bytes);
  await page
    .getByRole("button", { name: "直前の取り込みを戻す", exact: true })
    .click();
  await page
    .getByRole("button", { name: "この記録へ戻す", exact: true })
    .click();
  expect(await saved(page)).toEqual(oldStored);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "actual-export.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.reload();
  expect(await saved(page)).toEqual(expected);
  expect(errors).toEqual([]);
  await proof("files", browserName, {
    scope:
      "Public import of the unchanged genuinely earned pre-change return, then a prepared fixture adding the independently observed attack and malicious text fields. Advice is generated by code; no untrusted markup. Actual public download, undo to the entire old profile, reimport of the downloaded bytes and full profile reload. This is file migration, not an additional played defeat.",
    oldReturnExact: true,
    maliciousTextDiscarded: true,
    exportReimportExact: true,
    undoExact: true,
    reloadExact: true,
    errors,
  });
});
