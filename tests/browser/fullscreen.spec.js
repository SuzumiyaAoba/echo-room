import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

const resultPath = (name, engine) => `/tmp/echo-fullscreen-${name}-${engine}`;
async function fresh(page) {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.settings.flashes = false;
  await page.addInitScript(
    ({ key, profile }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(profile));
    },
    { key: SAVE_KEY, profile },
  );
  await page.goto("/");
}
async function state(page) {
  return page.evaluate(async (key) => {
    const bytes = new Uint8Array(
      document
        .querySelector("#world")
        .getContext("2d")
        .getImageData(0, 0, 960, 600).data,
    );
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      snapshot: window.__ECHO_LOOM__.snapshot(),
      history: structuredClone(window.__ECHO_LOOM__.game()?.history),
      pixels: [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      save: localStorage.getItem(key),
    };
  }, SAVE_KEY);
}
async function layout(page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector("#world"),
      r = canvas.getBoundingClientRect();
    const targets = [
      ...document.querySelectorAll(
        ".home-tools button,.panel button[data-action='fullscreen']",
      ),
    ].map((button) => {
      const b = button.getBoundingClientRect();
      return {
        text: button.textContent,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        font: Number.parseFloat(getComputedStyle(button).fontSize),
      };
    });
    return {
      active: document.fullscreenElement?.tagName || null,
      width: innerWidth,
      height: innerHeight,
      canvas: { width: r.width, height: r.height },
      intrinsic: [canvas.width, canvas.height],
      targets,
    };
  });
  expect(result.canvas.width / result.canvas.height).toBeCloseTo(1.6, 5);
  expect(result.intrinsic).toEqual([960, 600]);
  for (const b of result.targets) {
    expect(b.width).toBeGreaterThanOrEqual(40);
    expect(b.height).toBeGreaterThanOrEqual(40);
    expect(b.font).toBeGreaterThanOrEqual(10);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(result.width + 1);
  }
  return result;
}
async function toggle(page, active) {
  const button = page.locator('[data-action="fullscreen"]');
  await expect(button).toBeEnabled();
  await button.click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(active);
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute("aria-pressed", String(active));
}

test("公開全画面：灯台と設定・ESC終了・練習の入力解除と停止", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fresh(page);
  const layouts = [await layout(page)];
  await toggle(page, true);
  layouts.push(await layout(page));
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.locator('[data-action="fullscreen"]')).toHaveText(
    "全画面を閉じる",
  );
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  // The same Escape exits fullscreen, without closing the settings dialog.
  await expect(page.getByRole("heading", { name: "灯りの調整" })).toBeVisible();
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯りの練習", exact: true }).click();
  await page.keyboard.press("Escape");
  await toggle(page, true);
  const paused = await state(page);
  await page.waitForTimeout(350);
  expect(await state(page)).toEqual(paused);
  await page.getByRole("button", { name: "練習に戻る", exact: true }).click();
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(120);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect(
    page.getByRole("heading", { name: "灯りをひと休み" }),
  ).toBeVisible();
  const stopped = await state(page);
  await page.waitForTimeout(350);
  expect(await state(page)).toEqual(stopped);
  // Resume while the physical test keys remain down: stale held input is gone.
  await page.getByRole("button", { name: "練習に戻る", exact: true }).click();
  await page.waitForTimeout(250);
  const resumed = await state(page);
  expect(resumed.snapshot.player.x).toBe(stopped.snapshot.player.x);
  expect(resumed.snapshot.player.y).toBe(stopped.snapshot.player.y);
  expect(resumed.snapshot.run.time).toBeGreaterThan(stopped.snapshot.run.time);
  expect(resumed.history.slice(-5).every((h) => !h.fire)).toBe(true);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  expect(errors).toEqual([]);
  await writeFile(
    `${resultPath("native", browserName)}.json`,
    JSON.stringify(
      {
        scope:
          "Real browser Fullscreen API and native mouse/keyboard; read-only game diagnostic, no actor/HP/clock mutation. Headless viewports are not physical display verification.",
        layouts,
        paused,
        stopped,
        resumed,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("公開全画面：本編の停止・ブラウザAPI終了・画面比率と小画面", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fresh(page);
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("FULLSCREEN-LIGHT");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.keyboard.press("Escape");
  // Starting and immediately pausing can precede the first game draw. Let the
  // actual paused RAF draw replace the setup screen before comparing pixels.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const before = await state(page);
  await toggle(page, true);
  const entered = await state(page);
  expect(entered).toEqual(before);
  const layouts = [await layout(page)];
  await page.screenshot({ path: `${resultPath("pause", browserName)}.png` });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(120);
  // Exercise a browser-owned exit notification without an Escape key event.
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  const exited = await state(page);
  await page.waitForTimeout(350);
  expect(await state(page)).toEqual(exited);
  await page.keyboard.up("KeyD");
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 640, height: 360 },
    { width: 390, height: 844 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    layouts.push(await layout(page));
    await expect(page.locator('[data-action="fullscreen"]')).toBeInViewport();
    if (viewport.width === 360)
      await page.screenshot({
        path: `${resultPath("portrait", browserName)}.png`,
      });
  }
  expect(errors).toEqual([]);
  await writeFile(
    `${resultPath("combat", browserName)}.json`,
    JSON.stringify(
      {
        scope:
          "Native public run and native Fullscreen API. external exitFullscreen() is a deliberate browser-API exit; no gameplay state prepared.",
        before,
        entered,
        exited,
        layouts,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("制御したAPI：非対応・要求中の二重押し・拒否・再操作", async ({
  browser,
  browserName,
}) => {
  const records = [];
  for (const enabled of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((enabled) => {
      Object.defineProperty(document, "fullscreenEnabled", {
        configurable: true,
        get: () => enabled,
      });
      window.__fullscreenCalls = 0;
      Element.prototype.requestFullscreen = () => {
        window.__fullscreenCalls++;
        return new Promise((resolve, reject) => {
          window.__rejectFullscreen = reject;
        });
      };
    }, enabled);
    await fresh(page);
    const button = page.locator('[data-action="fullscreen"]');
    const before = await page.evaluate(
      (key) => localStorage.getItem(key),
      SAVE_KEY,
    );
    if (!enabled) {
      await expect(button).toBeDisabled();
      await page.getByRole("button", { name: "設定", exact: true }).click();
      await expect(
        page.getByText("このブラウザでは全画面を使えません。", { exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-action="fullscreen"]')).toBeDisabled();
      expect(await page.evaluate(() => window.__fullscreenCalls)).toBe(0);
    } else {
      await button.click();
      await expect(button).toBeDisabled();
      await expect(button).toHaveText("画面を切り替え中…");
      // Deliberately deliver duplicate DOM events; these are not native clicks.
      await button.dispatchEvent("click");
      await button.dispatchEvent("click");
      expect(await page.evaluate(() => window.__fullscreenCalls)).toBe(1);
      await page.evaluate(() =>
        window.__rejectFullscreen(new TypeError("test denial")),
      );
      await expect(button).toBeEnabled();
      await expect(button).toHaveText("全画面にする");
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator("#notifications")).toContainText(
        "このまま遊べます",
      );
      await button.click();
      expect(await page.evaluate(() => window.__fullscreenCalls)).toBe(2);
      await page.evaluate(() =>
        window.__rejectFullscreen(new TypeError("second denial")),
      );
      await expect(button).toBeEnabled();
      expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
      expect(
        await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY),
      ).toBe(before);
    }
    expect(errors).toEqual([]);
    records.push({
      enabled,
      calls: await page.evaluate(() => window.__fullscreenCalls),
      errors,
    });
    await context.close();
  }
  await writeFile(
    `${resultPath("controlled", browserName)}.json`,
    JSON.stringify(
      {
        scope:
          "Controlled API properties/promises and synthetic duplicate events; not real fullscreen capability evidence.",
        records,
      },
      null,
      2,
    ) + "\n",
  );
});
