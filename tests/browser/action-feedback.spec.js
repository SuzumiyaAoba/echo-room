import { artifacts as a } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createRun } from "../../src/game.js";
import { catalogUpgrades } from "../../src/content.js";
import { freshProfile, SAVE_KEY, prepareImport } from "../../src/save.js";
import { PAD_HINTS } from "../../src/gamepad.js";

const engine = (name) => (name === "webkit" ? "webkit-action-feedback" : name);
const proof = (kind, name, data) =>
  writeFile(
    `${a}/response-${kind}-${engine(name)}.json`,
    JSON.stringify(data, null, 2) + "\n",
  );
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const cue = (page) => page.locator("#action-feedback");
const state = (page) =>
  page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      time: g.t,
      casts: g.run.echoesCast,
      dash: g.player.dashSerial,
      charges: g.player.echoCharges,
      echoCd: g.player.echoCd,
      dashCd: g.player.dashCd,
      history: g.history.length,
      echoes: g.echoes.length,
      cue: document.querySelector("#action-feedback").textContent,
      announcement: document.querySelector("#action-feedback-announcement")
        .textContent,
    };
  });
async function prepared(page, depart = true) {
  const p = freshProfile();
  p.attempts = 2;
  p.run = createRun("RESPONSE-INPUT");
  p.settings.flashes = false;
  p.settings.shake = false;
  await page.addInitScript(
    ({ key, p }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(p));
    },
    { key: SAVE_KEY, p },
  );
  await page.goto("/");
  if (depart) await continueQuiet(page);
}
async function continueQuiet(page) {
  await page.locator('[data-action="continue"]').click();
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.spawnQueue = [{ time: Infinity }];
    g.enemies = [];
    g.bullets = [];
  });
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 24,
  );
}
async function freeze(page) {
  // Paused notices keep their remaining lifetime; settle the entrance animation.
  await page.waitForFunction(() =>
    document
      .querySelector("#notifications")
      .getAnimations({ subtree: true })
      .every((animation) => animation.playState === "finished"),
  );
  await page.waitForTimeout(150);
  const read = () =>
    page.evaluate(
      (key) => ({
        game: JSON.stringify(window.__ECHO_LOOM__.game()),
        pixels: document.querySelector("#world").toDataURL(),
        body: document.body.innerText,
        profile: localStorage.getItem(key),
      }),
      SAVE_KEY,
    );
  const before = await read();
  await page.waitForTimeout(350);
  expect(await read()).toEqual(before);
}

test("実際のR・回避の再入力・残響の使い切りで理由を示し、停止と充填・手持ち・保存を保つ", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await prepared(page);
  const initial = await saved(page),
    rows = [];
  await page.keyboard.press("KeyR");
  await expect(cue(page)).toHaveAttribute("data-reason", "empty");
  await expect(cue(page)).toContainText("先に残響を作る");
  await expect(page.locator("#action-feedback-key")).toHaveText("R");
  rows.push(await state(page));
  const serial = (await state(page)).dash;
  await page.keyboard.press("Space");
  await page.waitForFunction(
    (n) => window.__ECHO_LOOM__.game().player.dashSerial > n,
    serial,
  );
  await page.keyboard.press("Space");
  await expect(cue(page)).toHaveAttribute("data-reason", "cooldown");
  expect((await state(page)).dash).toBe(serial + 1);
  rows.push(await state(page));
  const capacity = await page.evaluate(
    () => window.__ECHO_LOOM__.game().stats.echoes,
  );
  for (let i = 0; i < capacity; i++) {
    const before = (await state(page)).casts;
    await page.keyboard.press("KeyQ");
    await page.waitForFunction(
      (n) => window.__ECHO_LOOM__.game().run.echoesCast > n,
      before,
    );
  }
  const casts = (await state(page)).casts;
  await page.keyboard.press("KeyQ");
  await expect(cue(page)).toHaveAttribute("data-reason", "charging");
  await expect(page.locator("#echo-status")).toContainText(
    `0/${capacity} · 充填中`,
  );
  const charging = await state(page);
  rows.push(charging);
  await page.waitForTimeout(180);
  expect((await state(page)).announcement).toBe(charging.announcement);
  expect((await state(page)).casts).toBe(casts);
  expect(await saved(page)).toEqual(initial);
  await page.keyboard.press("Escape");
  await freeze(page);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().player.echoCharges > 0,
  );
  await expect(cue(page)).toBeHidden();
  expect((await state(page)).casts).toBe(
    casts,
    "unavailable Q is never buffered",
  );
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    (n) => window.__ECHO_LOOM__.game().run.echoesCast > n,
    casts,
  );
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 0,
  );
  await expect(cue(page)).toBeHidden();
  expect(await saved(page)).toEqual(initial);
  expect(errors).toEqual([]);
  await proof("timing", browserName, {
    scope:
      "Prepared entry and an isolated enemy floor. Ordinary native keys perform the actual casts, release, dash and failed requests; no clock, history, charge, cooldown or damage writes. Full 350 ms pause and profile equality. Not an expedition result.",
    rows,
    capacity,
    casts,
    pauseMilliseconds: 350,
    pauseExact: true,
    saveExact: true,
    noBufferedInput: true,
    announcementStable: true,
    errors,
  });
});

test("公開の新しい旅で録画中のQと残響なしのRを読み、四画面・停止・実ファイルを保つ", async ({
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
  await page.locator("#seed").fill("RESPONSE-FIRST");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page
    .getByRole("button", { name: "最初のひと針へ →", exact: true })
    .click();
  await page.keyboard.press("KeyQ");
  await expect(cue(page)).toHaveAttribute("data-reason", "recording");
  const recording = await state(page);
  expect(recording.casts).toBe(0);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 24,
  );
  await expect(cue(page)).toBeHidden();
  expect((await state(page)).casts).toBe(0);
  const initial = await saved(page);
  await page.keyboard.press("KeyR");
  await expect(cue(page)).toHaveAttribute("data-reason", "empty");
  await page.screenshot({
    path: `${a}/response-after-${engine(browserName)}.png`,
  });
  const displays = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.keyboard.press("KeyR");
    await expect(cue(page)).toBeVisible();
    const layout = await cue(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        font: parseFloat(getComputedStyle(el).fontSize),
        overflow: document.documentElement.scrollWidth > innerWidth,
        inputTransparent: getComputedStyle(el).pointerEvents === "none",
      };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(viewport.width);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeLessThanOrEqual(viewport.height);
    expect(layout.font).toBeGreaterThanOrEqual(10);
    expect(layout.overflow).toBe(false);
    expect(layout.inputTransparent).toBe(true);
    displays.push({ viewport, ...layout });
  }
  expect(await saved(page)).toEqual(initial);
  await page.keyboard.press("Escape");
  await freeze(page);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  expect(await saved(page)).toEqual(initial);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const bytes = await readFile(await (await pending).path());
  // Existing file normalization explicitly fills unowned catalogue entries.
  // Derive that expected profile independently; retain every other field.
  const portable = structuredClone(initial);
  portable.run.upgrades = Object.fromEntries(
    catalogUpgrades(portable.run).map((u) => [
      u.id,
      initial.run.upgrades[u.id] || 0,
    ]),
  );
  expect(prepareImport(bytes.toString()).profile).toEqual(portable);
  await writeFile(`${a}/response-export-${engine(browserName)}.json`, bytes);
  await page.locator("#save-file").setInputFiles({
    name: "actual-response.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.reload();
  expect(await saved(page)).toEqual(portable);
  await page.locator('[data-action="continue"]').click();
  await expect(cue(page)).toBeHidden();
  expect(errors).toEqual([]);
  await proof("native", browserName, {
    scope:
      "Fresh public RESPONSE-FIRST. Actual early Q and empty R, no combat, history, cooldown, charge, RNG or save writes. Four display sizes, full 350 ms pause, actual download, public reimport, full profile reload and room re-entry without a retained message. No victory or full expedition claim.",
    recording,
    portable,
    displays,
    pauseMilliseconds: 350,
    pauseExact: true,
    saveExact: true,
    exportReimportExact: true,
    reloadExact: true,
    staleNoticeAbsent: true,
    errors,
  });
});

test("公開で替えたキー・実タップ・標準パッドAPIが同じ不発を知らせ、実際の操作の案内を使う", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__responsePad = {
        id: "Response API pad",
        index: 0,
        connected: true,
        mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      };
      Object.defineProperty(navigator, "getGamepads", {
        value: () => [window.__responsePad],
      });
    });
    await prepared(page, false);
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.locator(".keyboard-settings summary").click();
    await page
      .locator('[data-action="bindkey"][data-id="burst"][data-slot="0"]')
      .click();
    await page.keyboard.press("KeyK");
    await page
      .getByRole("button", { name: "設定を閉じる", exact: true })
      .click();
    await continueQuiet(page);
    const initial = await saved(page);
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(180);
    await expect(cue(page)).toBeHidden();
    await page.keyboard.press("KeyK");
    await expect(cue(page)).toHaveAttribute("data-reason", "empty");
    await expect(page.locator("#action-feedback-key")).toHaveText("K");
    const custom = await state(page);
    const rect = await page
      .locator('[data-touch-action="burst"]')
      .boundingBox();
    expect(rect).toBeTruthy();
    await page.touchscreen.tap(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    await expect(cue(page)).toHaveAttribute("data-reason", "empty");
    await expect(page.locator("#action-feedback-key")).toBeHidden();
    const touch = await state(page);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const p = window.__responsePad;
          p.buttons[4] = { pressed: true, value: 1 };
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              p.buttons[4] = { pressed: false, value: 0 };
              requestAnimationFrame(resolve);
            }),
          );
        }),
    );
    await expect(page.locator("#action-feedback-key")).toBeVisible();
    await expect(page.locator("#action-feedback-key")).toHaveText(
      PAD_HINTS.burst,
    );
    const pad = await state(page);
    expect(
      [custom, touch, pad].every((row) => row.casts === 0 && row.echoes === 0),
    ).toBe(true);
    expect(await saved(page)).toEqual(initial);
    expect(errors).toEqual([]);
    await proof("devices", browserName, {
      scope:
        "Prepared public entry, public keyboard remap to K (old R no longer acts), native touchscreen tap at the actual button rectangle, and frame-sampled Standard Gamepad API button 4. The API adapter changes only device values. No physical controller hardware claim.",
      custom,
      touch,
      pad,
      oldKeyInactive: true,
      touchKeyHidden: true,
      physicalHardware: false,
      saveExact: true,
      errors,
    });
  } finally {
    await context.close();
  }
});
