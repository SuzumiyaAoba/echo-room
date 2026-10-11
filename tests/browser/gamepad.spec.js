import { fixturePath } from "./artifacts.js";
import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { freshProfile, SAVE_KEY, exportProfile } from "../../src/save.js";

const proof = (name, engine, value) =>
  writeFile(
    `${assets}/pad-${name}-${engine}.json`,
    JSON.stringify(value, null, 2) + "\n",
  );
async function install(page, profile = freshProfile()) {
  await page.addInitScript(
    ({ profile, key }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(profile));
      window.__newPad = () => ({
        id: "Standard integration pad",
        index: 0,
        connected: true,
        mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      });
      window.__padDevice = window.__newPad();
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => (window.__padDevice ? [window.__padDevice] : []),
      });
    },
    { profile, key: SAVE_KEY },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "残響の灯台", exact: true }),
  ).toBeVisible();
}
const frames = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
const held = async (page, index, down) => {
  await page.evaluate(
    ({ index, down }) => {
      window.__padDevice.buttons[index] = {
        pressed: down,
        value: Number(down),
      };
    },
    { index, down },
  );
  await frames(page);
};
const axes = async (page, value) => {
  await page.evaluate((value) => (window.__padDevice.axes = value), value);
  await frames(page);
};
// Keep an API pulse down until the actual animation frame has sampled it,
// then release before the next frame. Host elapsed time cannot prove sampling.
async function press(page, index) {
  await page.evaluate(
    (index) =>
      new Promise((resolve) => {
        const pad = window.__padDevice;
        pad.buttons[index] = { pressed: true, value: 1 };
        requestAnimationFrame(() => {
          pad.buttons[index] = { pressed: false, value: 0 };
          requestAnimationFrame(() => resolve());
        });
      }),
    index,
  );
}
async function direction(page, sign) {
  await page.evaluate(
    (sign) =>
      new Promise((resolve) => {
        const pad = window.__padDevice;
        pad.axes = [0, sign, 0, 0];
        requestAnimationFrame(() => {
          pad.axes = [0, 0, 0, 0];
          requestAnimationFrame(() => resolve());
        });
      }),
    sign,
  );
}
async function choose(page, selector, activate = true) {
  for (let tries = 0; tries < 30; tries++) {
    const navigation = await page.evaluate((selector) => {
      const scope =
        document.querySelector(".overlay") ||
        document.querySelector("#interface");
      const items = [
        ...scope.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),summary",
        ),
      ].filter((e) => e.getClientRects().length);
      const target = items.findIndex((e) => e.matches(selector)),
        active = items.indexOf(document.activeElement);
      if (target < 0) throw new Error("Missing controller choice: " + selector);
      const down =
        active < 0
          ? target + 1
          : (target - active + items.length) % items.length;
      const up =
        active < 0
          ? target + 1
          : (active - target + items.length) % items.length;
      return { done: active === target, sign: down <= up ? 1 : -1 };
    }, selector);
    if (navigation.done) {
      if (activate) await press(page, 0);
      return;
    }
    await direction(page, navigation.sign);
  }
  throw new Error("Controller focus did not reach " + selector);
}
const state = (page) => page.evaluate(() => window.__ECHO_LOOM__.snapshot());
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const frozen = (page) =>
  page.evaluate(
    (key) => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      world: document.querySelector("#world").toDataURL(),
      body: document.body.innerText,
      profile: localStorage.getItem(key),
    }),
    SAVE_KEY,
  );
async function settlePause(page) {
  // Paused notices keep their remaining lifetime; settle the entrance animation.
  await page.waitForFunction(() =>
    document
      .querySelector("#notifications")
      .getAnimations({ subtree: true })
      .every((animation) => animation.playState === "finished"),
  );
  await page.waitForTimeout(150);
}
async function move(page, axis, destination) {
  const value = await page.evaluate(
      (axis) => window.__ECHO_LOOM__.game().player[axis],
      axis,
    ),
    sign = Math.sign(destination - value);
  await axes(page, axis === "x" ? [sign, 0, 0, 0] : [0, sign, 0, 0]);
  try {
    await page.waitForFunction(
      ({ axis, destination, sign }) =>
        (window.__ECHO_LOOM__.game().player[axis] - destination) * sign >= -4,
      { axis, destination, sign },
      { timeout: 12000 },
    );
  } finally {
    await axes(page, [0, 0, 0, 0]);
    await page.waitForTimeout(100);
  }
}

test("スティックで選択し、長押しと設定変更を保存し、案内を切り替える", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await install(page);
  await held(page, 0, true);
  await expect(
    page.getByRole("heading", { name: "旅の支度", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  expect((await state(page)).screen).toBe("setup");
  await held(page, 0, false);
  await page.waitForTimeout(120);
  await choose(page, '[data-action="weapon"][data-id="needle"]');
  await expect(
    page.locator('[data-action="weapon"][data-id="needle"]'),
  ).toBeFocused();
  await press(page, 1);
  expect((await state(page)).screen).toBe("home");
  await choose(page, '[data-action="settings"]');
  await choose(page, "#music-volume", false);
  const original = Number(await page.locator("#music-volume").inputValue());
  await held(page, 15, true);
  await page.waitForTimeout(650);
  await held(page, 15, false);
  await page.waitForTimeout(120);
  const music = Number(await page.locator("#music-volume").inputValue());
  expect(music).toBeGreaterThan(original + 0.05);
  expect(music).toBeLessThanOrEqual(1);
  await expect(page.locator("#music-volume")).toBeFocused();
  await press(page, 14);
  expect(Number(await page.locator("#music-volume").inputValue())).toBeCloseTo(
    music - 0.05,
    6,
  );
  await direction(page, 1);
  await expect(page.locator("#effects-volume")).toBeFocused();
  await direction(page, 1);
  await expect(page.locator("#setting-shake")).toBeFocused();
  const shake = await page.locator("#setting-shake").isChecked();
  await press(page, 0);
  expect(await page.locator("#setting-shake").isChecked()).toBe(!shake);
  const scrollBefore = await page
    .locator(".panel-content")
    .evaluate((e) => e.scrollTop);
  await axes(page, [0, 0, 0, 1]);
  await page.waitForTimeout(700);
  await axes(page, [0, 0, 0, 0]);
  const scrollAfter = await page
    .locator(".panel-content")
    .evaluate((e) => e.scrollTop);
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
  const guide = await page.locator("[data-pad-menu]").evaluate((e) => ({
    text: e.textContent,
    font: Number.parseFloat(getComputedStyle(e).fontSize),
  }));
  expect(guide.text).toContain("A / ×");
  expect(guide.font).toBeGreaterThanOrEqual(10);
  await choose(page, ".keyboard-settings > summary");
  await choose(page, '[data-action="bindkey"][data-id="echo"][data-slot="0"]');
  await expect(page.locator("#keyboard-status")).toContainText("キーを押して");
  await expect(page.locator("[data-pad-menu]")).toContainText(
    "B / ○ キャンセル",
  );
  await press(page, 1);
  expect((await state(page)).screen).toBe("settings");
  await expect(page.locator("#keyboard-status")).toContainText("キャンセル");
  await expect(page.locator("[data-pad-menu]")).toContainText("B / ○ 戻る");
  await page.screenshot({
    path: `${assets}/pad-settings-${info.project.name}.png`,
  });
  await press(page, 1);
  const saved = await stored(page);
  expect(saved.settings.music).toBeCloseTo(music - 0.05, 6);
  expect(saved.settings.shake).toBe(!shake);
  await page.reload();
  expect((await stored(page)).settings).toEqual(saved.settings);
  expect(errors).toEqual([]);
  await proof("menus", info.project.name, {
    scope:
      "Prepared fresh profile, standard Gamepad API values supplied to public menus. All menu navigation and activation after load uses the API pad, with no DOM focus or actor edits. Physical hardware is not exercised.",
    heldConfirmSingleScreen: true,
    weaponFocusKept: true,
    musicBefore: original,
    musicAfter: saved.settings.music,
    shakeAfter: !shake,
    scrollBefore,
    scrollAfter,
    guide,
    bindingCancelStaysInSettings: true,
    reloadExact: true,
    errors,
  });
});

test("パッドだけで五つの練習を終え、切断と再接続でも停止を保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await install(page);
  const before = await stored(page);
  await choose(page, '[data-action="practice"]', false);
  await held(page, 0, true);
  await expect(page.locator("#practice-title")).toContainText("灯りまで歩く");
  await page.waitForTimeout(650);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().player.dashSerial),
  ).toBe(0);
  await held(page, 0, false);
  await page.waitForTimeout(120);
  await move(page, "x", 90);
  await expect(page.locator("#practice-title")).toContainText("影を撃つ");
  const aim = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game(),
      e = g.enemies[0],
      dx = e.x - g.player.x,
      dy = e.y - g.player.y,
      l = Math.hypot(dx, dy);
    return [dx / l, dy / l];
  });
  await axes(page, [0, 0, ...aim]);
  await held(page, 7, true);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().practice.step === 2,
  );
  await held(page, 7, false);
  await axes(page, [0, 0, 0, 0]);
  await expect(page.locator('[data-control="echo"]')).toHaveText("RB / R1");
  await axes(page, [1, 0, 0, 0]);
  await press(page, 0);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().practice.step === 3,
  );
  await axes(page, [0, 0, 0, 0]);
  await move(page, "y", 160);
  await move(page, "x", 90);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().practice.phase === "cross",
  );
  await page.evaluate(() => (window.__padDevice = null));
  await expect(
    page.getByRole("heading", { name: "灯りをひと休み", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".toast-important")).toContainText("接続が切れた");
  await settlePause(page);
  const disconnected = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(disconnected);
  await page.evaluate(() => {
    window.__padDevice = window.__newPad();
    window.__padDevice.axes = [1, 0, 0, -1];
    for (const i of [0, 5, 7, 9])
      window.__padDevice.buttons[i] = { pressed: true, value: 1 };
  });
  await page.waitForTimeout(650);
  expect(await frozen(page)).toEqual(disconnected);
  await page.evaluate(() => {
    window.__padDevice = window.__newPad();
  });
  await page.waitForTimeout(140);
  await press(page, 9);
  expect((await state(page)).paused).toBe(false);
  await move(page, "x", 320);
  await press(page, 5);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().practice.step === 4,
  );
  await page.waitForFunction(
    () =>
      window.__ECHO_LOOM__.game().bullets.filter((b) => !b.friendly).length ===
      6,
  );
  await expect(page.locator("#practice-keys")).toHaveText("LB / L1");
  await page.keyboard.press("KeyV");
  await expect(page.locator('[data-control="echo"]')).toHaveText("Q");
  await expect(page.locator("#practice-hint")).toContainText("今の残響なら");
  const releaseReady = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      hint: g.practiceHint,
      echoes: g.echoes.map((e) => ({ x: e.x, y: e.y, age: e.age })),
      targets: g.enemies.map((e) => ({ x: e.x, y: e.y, hp: e.hp })),
    };
  });
  await held(page, 4, true);
  await page
    .getByRole("heading", { name: "最初の光が織れました", exact: true })
    .waitFor();
  await page.waitForTimeout(500);
  expect((await state(page)).screen).toBe("practice-complete");
  await expect(page.locator('[data-control="echo"]')).toHaveText("RB / R1");
  const actual = await page.evaluate(() => ({
    run: structuredClone(window.__ECHO_LOOM__.game().run),
    step: window.__ECHO_LOOM__.game().practice.step,
    dashes: window.__ECHO_LOOM__.game().player.dashSerial,
  }));
  expect(actual.step).toBe(5);
  expect(actual.run.echoesCast).toBeGreaterThan(0);
  expect(actual.run.threadCuts).toBeGreaterThan(0);
  expect(actual.dashes).toBeGreaterThan(0);
  await page.screenshot({
    path: `${assets}/pad-practice-${info.project.name}.png`,
  });
  await held(page, 4, false);
  await page.waitForTimeout(120);
  await press(page, 0);
  expect((await state(page)).screen).toBe("home");
  expect(await stored(page)).toEqual(before);
  expect(errors).toEqual([]);
  await proof("practice", info.project.name, {
    scope:
      "Real harmless five-step practice through the same Game input. Standard API pad controls all movement, aiming, shooting, dash, echo, release and menus. KeyV only tests prompt switching; it has no bound gameplay action. No game, actors, HP, history, time or profile mutation after initial fresh preparation. API integration is not physical hardware.",
    heldConfirmNoDash: true,
    disconnectedPauseExact: true,
    pauseMilliseconds: 350,
    reconnectedHeldControlsIgnored: true,
    releaseReady,
    keyboardPromptRestored: true,
    padPromptRestored: true,
    actual,
    saveExact: true,
    errors,
  });
});

test("実戦の記録から四画面で分岐を読み、パッドで選んで保存する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await install(page);
  const earned = JSON.parse(
    await readFile(fixturePath("forks-earned-rest-entry.json"), "utf8"),
  );
  const backup = `${assets}/pad-earned-${info.project.name}.json`;
  await writeFile(backup, exportProfile(earned));
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles(backup);
  await page.locator('[data-action="importrecord"]').click();
  await page.locator('[data-action="continue"]').click();
  expect((await state(page)).run.stage).toBe(18);
  await axes(page, [0, -1, 0, 0]);
  await page.waitForTimeout(2500);
  await axes(page, [0, 0, 0, 0]);
  await held(page, 1, true);
  await page.locator(".route-cards").waitFor();
  await page.waitForTimeout(500);
  expect((await state(page)).screen).toBe("route");
  await held(page, 1, false);
  await page.waitForTimeout(120);
  const initial = await page.locator(".route-card").evaluateAll((cards) => {
    const panel = document
      .querySelector(".panel-content")
      .getBoundingClientRect();
    return cards.map((card) => ({
      route: card.dataset.id,
      fields: [
        "h3",
        ".route-tactic",
        ".route-tactic-hint",
        ".route-encounter strong:last-of-type",
        ".detail",
      ].map((selector) => {
        const el = card.querySelector(selector),
          r = el.getBoundingClientRect();
        return {
          text: el.textContent,
          inside: r.top >= panel.top && r.bottom <= panel.bottom,
          font: Number.parseFloat(getComputedStyle(el).fontSize),
        };
      }),
    }));
  });
  expect(
    initial.every((row) => row.fields.every((f) => f.inside && f.font >= 10)),
  ).toBe(true);
  const fixed = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(fixed);
  const displays = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await choose(page, '[data-action="route"][data-id="salvage"]', false);
    const before = await page
      .locator(".panel-content")
      .evaluate((e) => e.scrollTop);
    await axes(page, [0, 0, 0, 1]);
    await page.waitForTimeout(500);
    await axes(page, [0, 0, 0, 0]);
    const view = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      scroll: document.querySelector(".panel-content").scrollTop,
      focused: document.activeElement.dataset.id,
      guideFont: Number.parseFloat(
        getComputedStyle(document.querySelector("[data-pad-menu]")).fontSize,
      ),
      hintFonts: [...document.querySelectorAll(".route-tactic-hint")].map((e) =>
        Number.parseFloat(getComputedStyle(e).fontSize),
      ),
    }));
    expect(view.overflow).toBe(false);
    expect(view.focused).toBe("salvage");
    expect(view.guideFont).toBeGreaterThanOrEqual(10);
    expect(view.hintFonts.every((f) => f >= 10)).toBe(true);
    displays.push({ viewport, before, ...view });
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await choose(page, '[data-action="route"][data-id="rest"]', false);
  const focus = await page.evaluate(() => {
    const e = document.activeElement,
      s = getComputedStyle(e);
    return {
      route: e.dataset.id,
      pad: document.querySelector("#app").classList.contains("pad-active"),
      outlineStyle: s.outlineStyle,
      outlineWidth: parseFloat(s.outlineWidth),
      outlineColor: s.outlineColor,
    };
  });
  expect(focus.route).toBe("rest");
  expect(focus.pad).toBe(true);
  expect(focus.outlineStyle).toBe("solid");
  expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
  await page.locator(".panel").screenshot({
    path: `${assets}/pad-focus-after-${info.project.name}.png`,
  });
  await page.screenshot({
    path: `${assets}/pad-routes-${info.project.name}.png`,
  });
  const dashes = await page.evaluate(
    () => window.__ECHO_LOOM__.game().player.dashSerial,
  );
  await held(page, 0, true);
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().run.stage === 19,
  );
  await page.waitForTimeout(650);
  expect((await state(page)).run.route).toBe("rest");
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().player.dashSerial),
  ).toBe(dashes);
  await held(page, 0, false);
  await page.waitForTimeout(120);
  await press(page, 9);
  await choose(page, '[data-action="savehome"]');
  expect((await state(page)).screen).toBe("home");
  const saved = await stored(page);
  expect(saved.run.stage).toBe(19);
  expect(saved.run.route).toBe("rest");
  expect(saved.run.encounterVersion).toBe(1);
  expect(errors).toEqual([]);
  await proof("routes", info.project.name, {
    scope:
      "Unchanged genuine stage-18 cleared rest profile from the previous expedition, serialized for public file import. Import and continue are public setup clicks; all following movement, route navigation, activation, pause and save-home use standard API pad values. Four resized menu views are the same paused real run. No actor, clock, enemy, HP or profile edits. No new combat or 24-room victory claim.",
    initial,
    heldBackDidNotDismissRoute: true,
    routePauseExact: true,
    pauseMilliseconds: 350,
    displays,
    heldConfirmNoDash: true,
    focus,
    saved,
    errors,
  });
});
