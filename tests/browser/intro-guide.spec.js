import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY, prepareImport } from "../../src/save.js";
const assets = ".mdxr/20261007195700-echo-loom/assets";
const sizes = [
  { width: 1200, height: 850 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 640, height: 360 },
  { width: 360, height: 640 },
];
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const frozen = (page) =>
  page.evaluate(
    (key) => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      pixels: document.querySelector("#world").toDataURL(),
      save: localStorage.getItem(key),
      body: document.body.innerText,
    }),
    SAVE_KEY,
  );
const world = ({ game, pixels, save }) => ({ game, pixels, save });
async function start(page, seed, touch = false) {
  await page
    .getByRole("button", { name: "灯りをともす" })
    [touch ? "tap" : "click"]();
  await page.locator("#seed").fill(seed);
  await page
    .getByRole("button", { name: "この灯りで出発する" })
    [touch ? "tap" : "click"]();
  await expect(page.locator(".first-help")).toBeVisible();
  await page.waitForTimeout(250);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
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
    const content = document.querySelector(".panel-content");
    return {
      device: document.querySelector(".first-help").dataset.device,
      viewport: { width: innerWidth, height: innerHeight },
      content: {
        ...rect(content),
        scrollHeight: content.scrollHeight,
        clientHeight: content.clientHeight,
        scrollTop: content.scrollTop,
        characters: content.innerText.length,
      },
      steps: [...document.querySelectorAll(".intro-step")].map((n) => ({
        ...rect(n),
        heading: n.querySelector("h3").textContent,
        paragraphFont: parseFloat(
          getComputedStyle(n.querySelector("p")).fontSize,
        ),
        text: n.innerText,
      })),
      paragraphs: [...document.querySelectorAll(".first-help p")].map((n) => ({
        ...rect(n),
        font: parseFloat(getComputedStyle(n).fontSize),
        text: n.textContent,
      })),
      buttons: [...document.querySelectorAll(".panel-footer button")].map(
        (n) => ({ ...rect(n), text: n.textContent }),
      ),
    };
  });
function verify(r, device) {
  expect(r.device).toBe(device);
  expect(r.steps).toHaveLength(3);
  expect(r.content.scrollTop).toBe(0);
  expect(r.content.scrollHeight).toBeLessThanOrEqual(
    r.content.clientHeight + 1,
  );
  for (const n of [...r.steps, ...r.paragraphs]) {
    expect(n.left).toBeGreaterThanOrEqual(0);
    expect(n.top).toBeGreaterThanOrEqual(r.content.top);
    expect(n.right).toBeLessThanOrEqual(r.viewport.width);
    expect(n.bottom).toBeLessThanOrEqual(r.content.bottom + 0.1);
    expect(n.paragraphFont ?? n.font).toBeGreaterThanOrEqual(11);
  }
  expect(r.buttons).toHaveLength(2);
  for (const n of r.buttons) {
    expect(n.height).toBeGreaterThanOrEqual(44);
    expect(n.top).toBeGreaterThanOrEqual(r.content.bottom - 0.1);
    expect(n.bottom).toBeLessThanOrEqual(r.viewport.height);
    expect(n.left).toBeGreaterThanOrEqual(0);
    expect(n.right).toBeLessThanOrEqual(r.viewport.width);
  }
}
async function pause(page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  await page.waitForTimeout(150);
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
}
async function portable(page, expected, name) {
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const bytes = await readFile(await (await event).path());
  const normalized = prepareImport(JSON.stringify(expected)).profile;
  expect(JSON.parse(bytes).profile).toEqual(normalized);
  expect(prepareImport(bytes.toString()).profile).toEqual(normalized);
  expect(await saved(page)).toEqual(expected);
  await writeFile(`${assets}/${name}.json`, bytes);
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: `${name}.json`,
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.locator('[data-action="importrecord"]').click();
  await page.reload();
  expect(await saved(page)).toEqual(normalized);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    before: expected,
    normalized,
    exportedAndRestoredNormalizedWholeProfileExact: true,
    rawProfileBeforeImportExact: true,
  };
}
async function moveAxis(page, axis, destination) {
  const value = await page.evaluate(
    (axis) => window.__ECHO_LOOM__.game().player[axis],
    axis,
  );
  if (Math.abs(value - destination) < 6) return;
  const key =
    axis === "x"
      ? value < destination
        ? "KeyD"
        : "KeyA"
      : value < destination
        ? "KeyS"
        : "KeyW";
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      ({ axis, destination, direction }) =>
        (window.__ECHO_LOOM__.game().player[axis] - destination) * direction >=
        -4,
      { axis, destination, direction: Math.sign(destination - value) },
      { timeout: 12000 },
    );
  } finally {
    await page.keyboard.up(key);
  }
}

test("本物の初回出発で三手順を五画面に収め、Q/R・詳細説明・実ファイルと次の出発を保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await start(page, "INTRO-KEYBOARD");
  const initial = await saved(page),
    fixed = world(await frozen(page)),
    rows = [];
  expect(initial.attempts).toBe(1);
  expect(initial.run.stage).toBe(0);
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    const r = await layout(page);
    verify(r, "keyboard");
    const before = await frozen(page);
    await page.waitForTimeout(350);
    expect(await frozen(page)).toEqual(before);
    expect(world(before)).toEqual(fixed);
    rows.push({ size, ...r });
    if (size.width === 640)
      await page.screenshot({
        path: `${assets}/intro-keyboard-${info.project.name}.png`,
      });
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page
    .getByRole("button", { name: "最初のひと針へ →", exact: true })
    .click();
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(180);
  await page.keyboard.up("KeyD");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 120,
  );
  await page.keyboard.press("KeyQ", { delay: 50 });
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().run.echoesCast))
    .toBe(1);
  await page.keyboard.press("KeyR", { delay: 50 });
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().echoes.length))
    .toBe(0);
  await pause(page);
  await page.getByRole("button", { name: "操作と残響の使い方" }).click();
  expect(await page.locator(".first-help").count()).toBe(0);
  await expect(page.locator("#recording-help")).toContainText(
    "点線が録画した道",
  );
  await expect(page.locator(".tutorial-grid")).toContainText("糸の中ほど");
  const manual = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(manual);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await pause(page);
  const actualProfile = await saved(page);
  const migration = await portable(
    page,
    actualProfile,
    `intro-export-${info.project.name}`,
  );
  await page.getByRole("button", { name: "航路を続ける" }).click();
  expect(await page.locator(".first-help").count()).toBe(0);
  await pause(page);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "新しい航路", exact: true }).click();
  await page.getByRole("button", { name: "新しい航路へ", exact: true }).click();
  await page.locator("#seed").fill("INTRO-SECOND");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  expect((await saved(page)).attempts).toBe(2);
  expect(await page.locator(".first-help").count()).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/intro-native-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Actual fresh first attempt and native move/Q/R. Five CSS viewports, complete readable help with no scrolling, whole Game/PNG/body/raw-save pauses. Full manual, actual export/public import/reload/continue and genuine second departure. No actor/profile/clock/RNG or DOM/CSS injection. Not a human enjoyment or physical device evaluation.",
        initial,
        rows,
        wholePausedWorldAndSaveAcrossSizesExact: true,
        nativeQAndR: true,
        fullManualRetained: true,
        firstAttemptOnly: true,
        exportImportReloadWholeProfileExact: true,
        exportSha256: migration.sha256,
        migration,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("初回案内から本物の五つのお題を完了し、元の航路・保存・詳しい説明へ戻る", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await start(page, "INTRO-PRACTICE");
  const initial = await saved(page);
  const original = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      run: structuredClone(g.run),
      player: { x: g.player.x, y: g.player.y },
      t: g.t,
    };
  });
  await page.getByRole("button", { name: "灯りの練習をする" }).click();
  const step = () =>
    page.evaluate(() => window.__ECHO_LOOM__.game().practice.step);
  await moveAxis(page, "x", 90);
  await expect.poll(step).toBe(1);
  await page.keyboard.down("KeyJ");
  await expect.poll(step).toBe(2);
  await page.keyboard.up("KeyJ");
  await page.keyboard.down("KeyD");
  await page.keyboard.press("Space");
  await expect.poll(step).toBe(3);
  await page.keyboard.up("KeyD");
  await moveAxis(page, "y", 160);
  await moveAxis(page, "x", 90);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().practice.phase === "cross",
  );
  await moveAxis(page, "x", 320);
  await page.keyboard.press("KeyQ", { delay: 50 });
  await expect.poll(step).toBe(4);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().practiceReleaseReady,
  );
  await page.keyboard.press("KeyR", { delay: 50 });
  await expect(
    page.getByRole("heading", { name: "最初の光が織れました" }),
  ).toBeVisible();
  const practice = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      step: g.practice.step,
      hp: g.run.hp,
      echoesCast: g.run.echoesCast,
      threadCuts: g.run.threadCuts,
      damageTaken: g.run.damageTaken,
    };
  });
  expect(practice.step).toBe(5);
  expect(practice.echoesCast).toBeGreaterThan(0);
  expect(practice.threadCuts).toBeGreaterThan(0);
  expect(practice.damageTaken).toBe(0);
  expect(await saved(page)).toEqual(initial);
  await page.screenshot({
    path: `${assets}/intro-practice-${info.project.name}.png`,
  });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.waitForTimeout(150);
  const restored = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      run: structuredClone(g.run),
      player: { x: g.player.x, y: g.player.y },
      t: g.t,
      practice: !!g.practice,
    };
  });
  expect(restored.practice).toBe(false);
  expect(restored.run.seed).toBe(original.run.seed);
  expect(restored.run.hp).toBe(original.run.hp);
  expect(restored.run.kills).toBe(original.run.kills);
  expect(restored.run.echoesCast).toBe(original.run.echoesCast);
  expect(restored.player).toEqual(original.player);
  expect(restored.t - original.t).toBeGreaterThanOrEqual(0);
  expect(restored.t - original.t).toBeLessThan(0.5);
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
  expect(await saved(page)).toEqual(initial);
  await page.getByRole("button", { name: "操作と残響の使い方" }).click();
  expect(await page.locator(".first-help").count()).toBe(0);
  await expect(page.locator("#recording-help")).toContainText("記録した動き");
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/intro-practice-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Actual first departure, optional public practice, all five native exercises, genuine return to the original expedition, native pause and full manual. No actor/profile/clock/RNG edits. The return resumes the world, so preserve original counters/position and verify the naturally elapsed interval below0.5s; subsequent full350ms freeze stays exact.",
        initial,
        original,
        practice,
        restored,
        originalWholeProfileExact: true,
        full350msFreezeExact: true,
        fullManualRetained: true,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("五画面の本当のタップで初回説明を読み、タッチの案内と安全な練習への出入りを保つ", async ({
  browser,
  browserName,
}, info) => {
  const rows = [],
    errors = [];
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: size,
      hasTouch: true,
      ...(browserName === "firefox" ? {} : { isMobile: true }),
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await start(page, "INTRO-TOUCH", true);
    const initial = await saved(page);
    const r = await layout(page);
    verify(r, "touch");
    await expect(page.locator(".intro-keys").first()).toBeHidden();
    await expect(page.locator(".intro-touch").first()).toBeVisible();
    expect(r.steps[0].text).toContain("左で移動");
    expect(r.steps[1].text).toContain("残響ボタン");
    expect(r.steps[2].text).toContain("解放ボタン");
    const before = await frozen(page);
    await page.waitForTimeout(350);
    expect(await frozen(page)).toEqual(before);
    if (size.width === 640)
      await page.screenshot({
        path: `${assets}/intro-touch-${info.project.name}.png`,
      });
    await page.getByRole("button", { name: "灯りの練習をする" }).tap();
    await expect(page.locator("#practice-title")).toContainText("灯りまで歩く");
    expect(await saved(page)).toEqual(initial);
    await page.getByRole("button", { name: "一時停止", exact: true }).tap();
    await page.getByRole("button", { name: "練習を終える", exact: true }).tap();
    expect(
      await page.evaluate(() => !!window.__ECHO_LOOM__.game().practice),
    ).toBe(false);
    expect(
      await page.evaluate(() => window.__ECHO_LOOM__.game().run.seed),
    ).toBe("INTRO-TOUCH");
    expect(await saved(page)).toEqual(initial);
    rows.push({
      size,
      ...r,
      freshFirstAttempt: initial.attempts === 1,
      full350msFreezeExact: true,
      actualTapPracticeEntryAndExit: true,
      wholeProfileExact: true,
    });
    await context.close();
  }
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/intro-touch-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Five independent fresh first departures using actual browser taps. Native touch-specific help, readable complete layout and public practice entry/exit. No prepared actors/profile/clock/RNG or DOM/CSS override. Browser touch is not a physical device evaluation; the five full exercises are tested separately through native keyboard input.",
        rows,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("公開で替えたキーと標準パッドAPIで初回の操作名を読み、停止と本物のF/Tを保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__introPad = {
      id: "Standard intro controller test",
      index: 0,
      mapping: "standard",
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [window.__introPad],
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator(".keyboard-settings summary").click();
  for (const [action, code] of [
    ["echo", "KeyF"],
    ["burst", "KeyT"],
  ]) {
    const binding = page.locator(
      `[data-action="bindkey"][data-id="${action}"][data-slot="0"]`,
    );
    await binding.click();
    await page.keyboard.press(code);
    await expect(binding).toHaveAttribute("aria-pressed", "false");
  }
  const settings = (await saved(page)).settings;
  expect(settings.keybindings.echo[0]).toBe("KeyF");
  expect(settings.keybindings.burst[0]).toBe("KeyT");
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await start(page, "INTRO-CONTROLS");
  await expect(page.locator('.first-help [data-control="echo"]')).toHaveText(
    "F",
  );
  await expect(page.locator('.first-help [data-control="burst"]')).toHaveText(
    "T",
  );
  const initial = await saved(page),
    fixed = world(await frozen(page));
  await page.evaluate(() => {
    window.__introPad.buttons[7] = { pressed: true, value: 1 };
  });
  await expect(page.locator(".first-help")).toHaveAttribute(
    "data-device",
    "pad",
  );
  await page.evaluate(() => {
    window.__introPad.buttons[7] = { pressed: false, value: 0 };
  });
  await expect(page.locator('.first-help [data-control="echo"]')).toHaveText(
    "RB / R1",
  );
  await expect(page.locator('.first-help [data-control="burst"]')).toHaveText(
    "LB / L1",
  );
  await expect(page.locator('.first-help [data-control="dash"]')).toHaveText(
    "A / ×",
  );
  const rows = [];
  for (const size of [sizes[0], sizes[3], sizes[4]]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    const r = await layout(page);
    verify(r, "pad");
    const before = await frozen(page);
    await page.waitForTimeout(350);
    expect(await frozen(page)).toEqual(before);
    expect(world(before)).toEqual(fixed);
    rows.push({ size, ...r });
    if (size.width === 640)
      await page.screenshot({
        path: `${assets}/intro-pad-${info.project.name}.png`,
      });
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page
    .getByRole("button", { name: "最初のひと針へ →", exact: true })
    .click();
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 120,
  );
  await page.keyboard.press("KeyQ", { delay: 50 });
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().run.echoesCast),
  ).toBe(0);
  await page.keyboard.press("KeyF", { delay: 50 });
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().run.echoesCast))
    .toBe(1);
  await page.keyboard.press("KeyT", { delay: 50 });
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().echoes.length))
    .toBe(0);
  await pause(page);
  expect((await saved(page)).settings).toEqual(settings);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/intro-controls-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Public native F/T key configuration before the genuinely fresh first departure. Inject only the standard navigator.getGamepads API, keep the world paused and verify native Input menu/device processing and three readable layouts. Native keyboard Q does not cast, F casts and T releases after resume. No actor/profile/clock/RNG or DOM/CSS override. Standard API exercise is not a physical controller test.",
        initial,
        rows,
        nativeConfiguredKeysExact: true,
        standardPadNamesExact: true,
        wholePausedWorldAndSaveAcrossModesExact: true,
        originalSettingsExact: true,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});
