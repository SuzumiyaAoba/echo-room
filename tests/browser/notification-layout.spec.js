import { fixturePath } from "./artifacts.js";
import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY, prepareImport } from "../../src/save.js";

const source = "encounter-entry-shell-voyage-9.json";
const sizes = [
  { width: 1200, height: 850 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 640, height: 360 },
  { width: 360, height: 640 },
];
const saved = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
const freeze = (page) =>
  page.evaluate(
    (k) => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      pixels: document.querySelector("#world").toDataURL(),
      save: localStorage.getItem(k),
    }),
    SAVE_KEY,
  );
async function start(page) {
  const bytes = await readFile(fixturePath(source)),
    profile = prepareImport(bytes.toString()).profile;
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: source,
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.locator('[data-action="importrecord"]').click();
  expect(await saved(page)).toEqual(profile);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-flashes").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  const initial = await saved(page);
  await page.locator('[data-action="continue"]').click();
  return { bytes, initial };
}
const layout = (page) =>
  page.evaluate(() => {
    const rect = (n) => {
      const r = n.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const controls = [
      ...document.querySelectorAll(
        ".action-dock,.touch-actions,.stick,.action-feedback",
      ),
    ]
      .map((n) => ({ name: n.className, ...rect(n) }))
      .filter((r) => r.width > 0 && r.height > 0);
    const notices = [...document.querySelectorAll("#notifications .toast")].map(
      (n) => ({
        ...rect(n),
        text: n.textContent,
        important: n.classList.contains("toast-important"),
        scrollHeight: n.scrollHeight,
        clientHeight: n.clientHeight,
      }),
    );
    const host = document.querySelector("#notifications");
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return {
      combat: host.dataset.combat,
      host: rect(host),
      notices,
      controls,
      viewport: { width: innerWidth, height: innerHeight },
      overlaps: notices
        .flatMap((n) =>
          controls.map((c) => ({ control: c.name, area: overlap(n, c) })),
        )
        .filter((r) => r.area > 0),
      pointerEvents: getComputedStyle(host).pointerEvents,
    };
  });
function verify(r) {
  expect(r.combat).toBe("true");
  expect(r.notices.length).toBeGreaterThan(0);
  expect(r.controls.length).toBeGreaterThan(0);
  expect(r.overlaps).toEqual([]);
  expect(r.pointerEvents).toBe("none");
  for (const n of r.notices) {
    expect(n.left).toBeGreaterThanOrEqual(0);
    expect(n.top).toBeGreaterThanOrEqual(0);
    expect(n.right).toBeLessThanOrEqual(r.viewport.width);
    expect(n.bottom).toBeLessThanOrEqual(
      Math.min(...r.controls.map((c) => c.top)) - 7.9,
    );
    expect(n.bottom).toBeLessThanOrEqual(r.host.bottom + 0.1);
    expect(n.top).toBeGreaterThanOrEqual(r.host.top - 0.1);
    expect(n.scrollHeight).toBeLessThanOrEqual(n.clientHeight + 1);
  }
}
const artifact = (name, info, result) =>
  writeFile(
    `${assets}/notice-${name}-${info.project.name}.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
async function exported(page, initial, info, prefix) {
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const bytes = await readFile(await (await pending).path());
  expect(prepareImport(bytes.toString()).profile).toEqual(initial);
  await writeFile(
    `${assets}/notice-${prefix}-export-${info.project.name}.json`,
    bytes,
  );
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "actual-notice.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.locator('[data-action="importrecord"]').click();
  await page.reload();
  expect(await saved(page)).toEqual(initial);
  return createHash("sha256").update(bytes).digest("hex");
}

test("本物の庭の案内を操作欄の上で読み、公開Q/R・停止・実ファイルを保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { bytes, initial } = await start(page);
  await page.waitForFunction(
    () =>
      window.__ECHO_LOOM__.game().history.length >= 120 &&
      [...document.querySelectorAll(".toast")].some((n) =>
        n.textContent.includes("糸喰いが仲間"),
      ),
  );
  await page.keyboard.press("KeyQ", { delay: 50 });
  await page.waitForTimeout(250);
  const visible = await layout(page);
  verify(visible);
  expect(visible.notices.some((n) => n.text.includes("糸喰いが仲間"))).toBe(
    true,
  );
  expect(await saved(page)).toEqual(initial);
  await page.screenshot({
    path: `${assets}/notice-live-${info.project.name}.png`,
  });
  await page.keyboard.press("KeyR", { delay: 50 });
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().echoes.length),
  ).toBe(0);
  await page.waitForFunction(
    () => document.querySelectorAll(".toast").length === 0,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  expect(
    await page.locator("#notifications").getAttribute("data-combat"),
  ).toBeNull();
  const first = await freeze(page),
    body = await page.locator("body").innerText();
  await page.waitForTimeout(350);
  expect(await freeze(page)).toEqual(first);
  expect(await page.locator("body").innerText()).toBe(body);
  const exportSha256 = await exported(page, initial, info, "public");
  expect(errors).toEqual([]);
  await artifact("native", info, {
    scope:
      "Genuine SHELL-VOYAGE garden public file import, actual naturally emitted cord notice, native Q/R, real control geometry, whole350ms pause and actual download/public home import/reload. No battle/profile/actor/clock/RNG injection; not a fresh expedition or human playtest.",
    sourceArtifact: source,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    visible,
    fullFreezeExact: true,
    wholeProfileExact: true,
    exportImportReloadExact: true,
    exportSha256,
    errors,
  });
});

test("停止した本物の世界で通知二つ・HUD再構築・補助欄・タッチ五サイズの配置だけを検証", async ({
  browser,
  browserName,
}, info) => {
  const context = await browser.newContext({
    viewport: sizes[0],
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await start(page);
    await page.waitForFunction(
      () => document.querySelectorAll(".toast").length === 0,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const before = await freeze(page);
    await page.evaluate(() => {
      document.querySelector(".overlay").remove();
      const host = document.querySelector("#notifications");
      host.replaceChildren();
      for (const [message, important] of [
        ["保存領域に書き込めません。設定から記録を書き出せます。", true],
        [
          "糸喰いが昨日を逆走する。赤い足跡を避け、動き出した影は光糸・解放でほどけます。",
          false,
        ],
      ]) {
        const n = document.createElement("div");
        n.className = important ? "toast toast-important" : "toast";
        n.textContent = message;
        host.append(n);
      }
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#notifications")
        .getAnimations({ subtree: true })
        .every((animation) => animation.playState === "finished"),
    );
    const rows = [];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(250);
      const base = await layout(page);
      verify(base);
      expect(base.notices.length).toBe(2);
      await page.evaluate(() => {
        for (let row = 0; row < 6; row++) {
          const n = document.createElement("small");
          n.className = "echo-detail notice-extra";
          n.textContent = "配置確認の補助行";
          document.querySelectorAll(".ability>div")[2].append(n);
        }
        const original = document.querySelector(".action-feedback");
        const feedback = original.cloneNode(true);
        feedback.classList.add("notice-feedback");
        original.after(feedback);
        feedback.hidden = false;
        feedback.querySelector("strong").textContent = "残響";
        feedback.querySelector("span").textContent =
          "手持ちの残響を待っています";
      });
      await page.waitForTimeout(100);
      const expanded = await layout(page);
      verify(expanded);
      expect(expanded.host.bottom).toBeLessThan(base.host.bottom);
      await page.evaluate(() => {
        document.querySelectorAll(".notice-extra").forEach((n) => n.remove());
        document
          .querySelectorAll(".notice-feedback")
          .forEach((n) => n.remove());
        const ui = document.querySelector("#interface");
        // Rebuild the HUD as a screen transition would, replacing every node.
        ui.replaceChildren(
          ...[...ui.children].map((node) => node.cloneNode(true)),
        );
      });
      await page.waitForTimeout(100);
      const rebuilt = await layout(page);
      verify(rebuilt);
      expect(rebuilt.host.bottom).toBe(base.host.bottom);
      expect(await freeze(page)).toEqual(before);
      rows.push({ size, base, expanded, rebuilt });
      if (size.width === 640)
        await page.screenshot({
          path: `${assets}/notice-touch-${info.project.name}.png`,
        });
    }
    expect(await freeze(page)).toEqual(before);
    expect(errors).toEqual([]);
    await artifact("prepared", info, {
      scope:
        "Public import of the actually earned garden followed by native pause. DOM-only removal of pause overlay, synthetic ordinary/important notices and helper rows, feedback visibility, and DOM-only HUD rebuild to exercise the layout observers. Actual Game/RNG, internal PNG and raw save stay byte-exact. No public battle or physical device claim for these prepared UI scenarios.",
      rows,
      preparedUiOnly: true,
      wholeGamePixelsAndRawSaveExact: true,
      errors,
    });
  } finally {
    await context.close();
  }
});

test("本物の保存失敗を案内と一緒に操作欄の上へ残し、書き出しで回収する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { initial } = await start(page);
  await page.waitForFunction(
    () =>
      window.__ECHO_LOOM__.game().history.length >= 120 &&
      document.querySelectorAll(".toast").length === 0,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.evaluate((key) => {
    window.__NOTICE_ORIGINAL_SET__ = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key)
        throw new DOMException("Prepared quota failure", "QuotaExceededError");
      return window.__NOTICE_ORIGINAL_SET__.call(this, k, v);
    };
  }, SAVE_KEY);
  await page.locator("#music-volume").focus();
  await page.locator("#music-volume").press("ArrowRight");
  await expect(page.locator("#music-volume")).toHaveValue("0.4");
  await expect(page.locator(".toast-important")).toContainText(
    "保存領域に書き込めません",
  );
  expect(await saved(page)).toEqual(initial);
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.press("KeyQ", { delay: 50 });
  await page.waitForTimeout(250);
  const visible = await layout(page);
  verify(visible);
  expect(
    visible.notices.some(
      (n) => n.important && n.text.includes("保存領域に書き込めません"),
    ),
  ).toBe(true);
  expect(visible.notices.length).toBeLessThanOrEqual(2);
  expect(await saved(page)).toEqual(initial);
  await page.screenshot({
    path: `${assets}/notice-important-${info.project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__NOTICE_ORIGINAL_SET__;
  });
  const expected = structuredClone(initial);
  expected.settings.music = 0.4;
  const exportSha256 = await exported(page, expected, info, "important");
  expect(errors).toEqual([]);
  await artifact("important", info, {
    scope:
      "Actually earned garden and native settings/resume/Q. Inject only localStorage SAVE_KEY quota failure, then perform the actual music edit and observe the real important persistence notice. Disk remains the original complete profile; actual download recovers the edited profile and public import/reload matches it after restoring storage. No battle/actor/health/clock/RNG injection.",
    visible,
    diskWholeProfileBeforeRecoveryExact: true,
    exportImportReloadExact: true,
    exportSha256,
    errors,
  });
});

test("案内を出したまま3.5秒停止して読み、戻ってから残りの時間を保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { bytes, initial } = await start(page);
  await page.waitForFunction(
    () =>
      window.__ECHO_LOOM__.game().history.length >= 120 &&
      [...document.querySelectorAll(".toast")].some((n) =>
        n.textContent.includes("糸喰いが仲間"),
      ),
  );
  await page.waitForTimeout(250);
  const original = await page
    .locator("#notifications .toast")
    .filter({ hasText: "糸喰いが仲間" })
    .elementHandle();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const before = await freeze(page),
    body = await page.locator("body").innerText();
  await page.waitForTimeout(3500);
  expect(await freeze(page)).toEqual(before);
  expect(await page.locator("body").innerText()).toBe(body);
  expect(await original.evaluate((n) => n.isConnected)).toBe(true);
  expect(await saved(page)).toEqual(initial);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.waitForTimeout(300);
  expect(await original.evaluate((n) => n.isConnected)).toBe(true);
  verify(await layout(page));
  await expect
    .poll(() => original.evaluate((n) => n.isConnected), { timeout: 5000 })
    .toBe(false);
  expect(errors).toEqual([]);
  await artifact("pause", info, {
    scope:
      "Actual naturally emitted cord notice at the genuinely earned garden; native pause for3500ms with whole Game/PNG/body/raw save exact, native resume and the same original DOM notice still connected after300ms, then expires within its active display budget. No battle/profile/actor/health/clock/RNG edits or timer injection.",
    sourceArtifact: source,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    pauseMilliseconds: 3500,
    wholeGamePixelsBodyAndRawSaveExact: true,
    wholeProfileExact: true,
    sameNoticeAfterResume300ms: true,
    expiresAfterActiveDisplay: true,
    errors,
  });
});
