import { fixturePath } from "./artifacts.js";
import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createRun } from "../../src/game.js";
import {
  freshProfile,
  SAVE_KEY,
  exportProfile,
  prepareImport,
} from "../../src/save.js";

async function importPublic(page, bytes) {
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "bell-fixture.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
}
async function frozen(page) {
  return page.evaluate(async (key) => {
    const g = window.__ECHO_LOOM__.game(),
      c = document.querySelector("#world");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    return {
      game: JSON.stringify(g),
      save: localStorage.getItem(key),
      pixels: [...new Uint8Array(hash)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    };
  }, SAVE_KEY);
}
async function prepare(page, full = false) {
  await page.locator('[data-action="pause"]').click();
  await page.evaluate((full) => {
    const g = window.__ECHO_LOOM__.game(),
      p = g.player;
    // Prepared arena for an exact departure-radius assertion; this is not
    // a natural expedition. Native input still invokes the actual dash once.
    g.enemies = [];
    g.spawnQueue = [];
    g.bullets = [];
    g.clearTimer = 0;
    p.echoCharges = full ? g.stats.echoes : 0;
    p.echoCd = 2;
    p.dashCd = 0;
    const original = g.dash;
    g.dash = function (...args) {
      // Prepare the boundary at the actual native activation. Normal bullet
      // updates before Space must not change the fixture.
      for (const [dx, friendly] of [
        [0, false],
        [38, false],
        [-20, false],
        [38.001, false],
        [0, true],
      ]) {
        const b = g.makeBullet(
          { x: p.x + dx - 4, y: p.y },
          0,
          10,
          0,
          friendly,
          "#fff",
          0,
          false,
        );
        b.testDx = dx;
      }
      const before = {
        origin: { x: p.x, y: p.y },
        cooldown: p.echoCd,
        charges: p.echoCharges,
        bullets: this.bullets.map((b) => ({
          dx: b.testDx,
          friendly: b.friendly,
          x: b.x,
          y: b.y,
        })),
      };
      const result = Reflect.apply(original, this, args);
      window.__bellCall = {
        before,
        after: {
          cooldown: p.echoCd,
          charges: p.echoCharges,
          cuts: this.run.bellCuts,
          recovered: this.run.bellRecovered,
          pulse: structuredClone(this.bellPulse),
          remaining: this.bullets.map((b) => ({
            dx: b.testDx,
            friendly: b.friendly,
          })),
        },
      };
      queueMicrotask(() =>
        document.querySelector('[data-action="pause"]').click(),
      );
      return result;
    };
  }, full);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "航路へ戻る", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(100);
  return page.evaluate(() => window.__bellCall);
}
async function proof(page, browserName, kind, data) {
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
  await writeFile(
    assets + "/bell-native-" + kind + "-" + browserName + ".json",
    JSON.stringify(
      {
        scope:
          "Prepared arena, actual native Space input and real dash implementation; not natural journey combat",
        data,
        frozen: before,
      },
      null,
      2,
    ) + "\n",
  );
  const canvas = await page
    .locator("#world")
    .evaluate((c) => c.toDataURL("image/png"));
  await writeFile(
    assets + "/bell-world-" + kind + "-" + browserName + ".png",
    Buffer.from(canvas.split(",")[1], "base64"),
  );
  await page.screenshot({
    path: assets + "/bell-native-" + kind + "-" + browserName + ".png",
  });
}

test("実際の帰還報酬で鈴を解放し、新しい旅の消弾・充填回復と輪を一時停止する", async ({
  page,
  browserName,
}) => {
  const bytes = await readFile(fixturePath("return-offline-export.json"));
  const initial = prepareImport(bytes.toString()).profile;
  await importPublic(page, bytes);
  await page.getByRole("button", { name: "灯守の工房", exact: true }).click();
  await page.locator('[data-action="unlock"][data-id="bell"]').click();
  const unlocked = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    SAVE_KEY,
  );
  expect(unlocked.memory).toBe(initial.memory - 25);
  expect(unlocked.unlocked).toContain("bell");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator('[data-action="relic"][data-id="bell"]').click();
  await expect(page.locator("#relic-description")).toContainText(
    "1回最大0.9秒",
  );
  await page.locator("#seed").fill("BELL-NATIVE");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  const help = page.getByRole("button", { name: "最初のひと針へ" });
  if (await help.count()) await help.click();
  const call = await prepare(page);
  expect(call.before.bullets).toHaveLength(5);
  expect(call.after.cuts).toBe(3);
  expect(call.after.recovered).toBeCloseTo(0.9, 12);
  expect(call.before.cooldown - call.after.cooldown).toBeCloseTo(0.9, 12);
  expect(call.after.charges).toBe(0);
  expect(call.after.remaining).toEqual([
    { dx: 38.001, friendly: false },
    { dx: 0, friendly: true },
  ]);
  expect({ x: call.after.pulse.x, y: call.after.pulse.y }).toEqual(
    call.before.origin,
  );
  await proof(page, browserName, "recovery", call);
  await page
    .getByRole("button", { name: "織片を確かめる", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "1発につき残響の充填を0.3秒",
  );
  await expect(page.getByRole("dialog")).toContainText("鈴でほどいた弾 3発");
  await expect(page.getByRole("dialog")).toContainText("戻した充填 0.9秒");
});

test("満充填の鈴は敵弾を消しても次の残響へ時間を持ち越さない", async ({
  page,
  browserName,
}) => {
  const p = freshProfile();
  p.attempts = 2;
  p.unlocked.push("bell");
  p.run = createRun("BELL-FULL", "needle", "bell");
  await importPublic(page, Buffer.from(exportProfile(p)));
  await page.locator('[data-action="continue"]').click();
  const call = await prepare(page, true);
  expect(call.after.cuts).toBe(3);
  expect(call.after.recovered).toBe(0);
  expect(call.after.cooldown).toBe(call.before.cooldown);
  expect(call.after.charges).toBe(1);
  await proof(page, browserName, "full", call);
});

test("旧鈴の公開取り込みと再開は消弾だけを行い、充填回復と計数を加えない", async ({
  page,
  browserName,
}) => {
  const p = freshProfile();
  p.attempts = 2;
  p.unlocked.push("bell");
  p.run = createRun("BELL-LEGACY", "needle", "bell");
  delete p.run.bellVersion;
  delete p.run.bellCuts;
  delete p.run.bellRecovered;
  await importPublic(page, Buffer.from(exportProfile(p)));
  const imported = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    SAVE_KEY,
  );
  expect(Object.hasOwn(imported.run, "bellVersion")).toBe(false);
  await page.locator('[data-action="continue"]').click();
  const call = await prepare(page);
  expect(call.after.cooldown).toBe(call.before.cooldown);
  expect(call.after.cuts).toBeUndefined();
  expect(call.after.recovered).toBeUndefined();
  expect(call.after.pulse).toBeUndefined();
  expect(call.after.remaining).toEqual([
    { dx: 38.001, friendly: false },
    { dx: 0, friendly: true },
  ]);
  await proof(page, browserName, "legacy", call);
  await page
    .getByRole("button", { name: "織片を確かめる", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "回避時に周囲の弾を消去。危険をすり抜ける。",
  );
  await expect(page.getByRole("dialog")).not.toContainText("0.3秒");
});
