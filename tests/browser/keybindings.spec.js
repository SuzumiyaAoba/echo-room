import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { freshProfile, SAVE_KEY, prepareImport } from "../../src/save.js";
import { createRun } from "../../src/game.js";

const assets = ".mdxr/20261007195700-echo-loom/assets";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const custom = {
  fire: "KeyF",
  up: "KeyI",
  down: "KeyK",
  left: "KeyJ",
  right: "KeyL",
  dash: "KeyV",
  echo: "KeyC",
  burst: "KeyB",
  interact: "KeyN",
};
const buttonFor = (page, action, slot = 0) =>
  page.locator(
    `[data-action="bindkey"][data-id="${action}"][data-slot="${slot}"]`,
  );
async function fresh(page) {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.settings.autoAim = true;
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
async function bind(page, action, code, slot = 0) {
  await buttonFor(page, action, slot).click();
  await page.keyboard.press(code);
  await expect(buttonFor(page, action, slot)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
}
async function remap(page) {
  await page.locator('[data-action="settings"]').click();
  await page.locator(".keyboard-settings summary").click();
  for (const [action, code] of Object.entries(custom))
    await bind(page, action, code);
}
const frozen = (page) =>
  page.evaluate(() => ({
    game: JSON.stringify(window.__ECHO_LOOM__.game()),
    world: document.querySelector("#world").toDataURL(),
  }));

test("公開のキー設定で七体の部屋を突破し、案内・保存と再開・次の航路を保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fresh(page);
  await remap(page);
  await buttonFor(page, "fire").click();
  await page.keyboard.press("KeyI");
  await expect(page.locator("#keyboard-status")).toContainText("上へ移動");
  await expect(buttonFor(page, "fire")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(buttonFor(page, "fire")).toHaveText("F");
  await bind(page, "echo", "KeyX", 1);
  await bind(page, "echo", "Delete", 1);
  await buttonFor(page, "echo").click();
  await page.keyboard.press("Delete");
  await expect(page.locator("#keyboard-status")).toContainText("一つはキー");
  await page.keyboard.press("Escape");
  await buttonFor(page, "echo", 1).click();
  await page.keyboard.press("ShiftRight");
  await expect(page.locator("#keyboard-status")).toContainText("回避");
  await page.keyboard.press("Escape");
  await buttonFor(page, "echo", 1).click();
  await page.keyboard.press("Control+KeyX");
  await expect(page.locator("#keyboard-status")).toContainText("組み合わせ");
  await page.keyboard.press("Escape");
  await buttonFor(page, "echo", 1).click();
  await page.locator("#effects-volume").click();
  await expect(buttonFor(page, "echo", 1)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#keyboard-status")).toContainText("キャンセル");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${assets}/keybindings-settings.png` });
  const configured = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).settings,
    SAVE_KEY,
  );
  expect(configured.keybindings.echo).toEqual(["KeyC", null]);
  expect(configured.keybindings.fire).toEqual(["KeyF", "KeyZ"]);
  await page.keyboard.press("Escape");
  await page.locator('[data-action="help"]').click();
  await expect(page.locator(".tutorial-grid")).toContainText("IJKL");
  await expect(page.locator(".tutorial-grid")).toContainText("C");
  await expect(page.locator(".controls-grid")).toContainText("V");
  await expect(page.locator(".controls-grid")).toContainText("F");
  await page.keyboard.press("Escape");
  await page.locator('[data-action="setup"]').click();
  await page.locator("#seed").fill("DEFEAT-WEAVE-NATIVE");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await expect(page.locator(".action-dock")).toContainText("C");
  await expect(page.locator(".action-dock")).toContainText("B");
  await expect(page.locator(".action-dock")).toContainText("V");
  const initial = await page.evaluate(() => window.__ECHO_LOOM__.snapshot());
  await page.keyboard.down("KeyI");
  try {
    await page.waitForFunction(
      (y) => window.__ECHO_LOOM__.snapshot().player.y < y - 10,
      initial.player.y,
      { timeout: 5000 },
    );
  } finally {
    await page.keyboard.up("KeyI");
  }
  const moved = await page.evaluate(() => window.__ECHO_LOOM__.snapshot());
  expect(moved.player.y).toBeLessThan(initial.player.y - 10);
  await page.keyboard.down("KeyF");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 24,
  );
  await page.keyboard.press("KeyC");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().run.echoesCast > 0,
  );
  await page.keyboard.up("KeyF");
  await page.keyboard.press("Escape");
  await page.locator('[data-action="settings"]').click();
  const before = await frozen(page);
  await page.waitForTimeout(300);
  expect(await frozen(page)).toEqual(before);
  await page.locator(".keyboard-settings summary").click();
  await buttonFor(page, "dash").click();
  await page.keyboard.down("KeyV");
  await expect(buttonFor(page, "dash")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down("KeyV");
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().player.dashCd),
  ).toBe(0);
  await page.keyboard.up("KeyV");
  await page.keyboard.press("KeyV");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().player.dashCd))
    .toBeGreaterThan(0);
  const held = new Set(),
    movement = [];
  let cleared = false;
  for (let step = 0; step < 450; step++) {
    const mode = await page.evaluate(() => window.__ECHO_LOOM__.game().mode);
    if (mode === "reward") {
      cleared = true;
      break;
    }
    expect(mode).toBe("combat");
    const angle = step / 12,
      wanted = ["KeyF"];
    if (step < 15) wanted.push("KeyI");
    else {
      if (Math.cos(angle) > 0.25) wanted.push("KeyL");
      if (Math.cos(angle) < -0.25) wanted.push("KeyJ");
      if (Math.sin(angle) > 0.25) wanted.push("KeyK");
      if (Math.sin(angle) < -0.25) wanted.push("KeyI");
    }
    for (const key of [...held])
      if (!wanted.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of wanted)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
    if (step % 10 === 5) await page.keyboard.press("KeyC");
    if (step % 18 === 9) await page.keyboard.press("KeyV");
    if (step % 20 === 15) await page.keyboard.press("KeyB");
    if (step % 10 === 0) movement.push({ step, keys: wanted });
    await page.waitForTimeout(100);
  }
  for (const key of held) await page.keyboard.up(key);
  expect(cleared).toBe(true);
  expect(await page.evaluate(() => window.__ECHO_LOOM__.game().run.kills)).toBe(
    7,
  );
  await page.locator('[data-action="skipreward"]').click();
  await expect(page.locator("#notifications")).toContainText("N で次の航路");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${assets}/keybindings-cleared.png` });
  await page.keyboard.press("Escape");
  await page.locator('[data-action="savehome"]').click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  expect(saved.settings).toEqual(configured);
  expect(saved.run.kills).toBe(7);
  expect(saved.run.checkpoint).toBe("cleared");
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(await page.evaluate(() => window.__ECHO_LOOM__.game().mode)).toBe(
    "cleared",
  );
  for (let step = 0; step < 160; step++) {
    const p = await page.evaluate(() => window.__ECHO_LOOM__.snapshot().player);
    if (Math.abs(p.x - 240) < 18 && p.y < 55) break;
    const keys = [];
    if (p.y > 40) keys.push("KeyI");
    if (p.x > 250) keys.push("KeyJ");
    if (p.x < 230) keys.push("KeyL");
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(50);
    for (const key of keys) await page.keyboard.up(key);
  }
  await page.keyboard.press("KeyN");
  await expect(page.locator('[data-action="route"]')).not.toHaveCount(0);
  await page.locator('[data-action="route"]').first().click();
  expect(await page.evaluate(() => window.__ECHO_LOOM__.game().run.stage)).toBe(
    1,
  );
  await page.keyboard.press("Escape");
  await page.locator('[data-action="settings"]').click();
  const downloadEvent = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const download = await downloadEvent;
  const file = await readFile(await download.path(), "utf8");
  const exported = prepareImport(file).profile;
  expect(exported.settings).toEqual(configured);
  expect(exported.run.stage).toBe(1);
  expect(exported.run.kills).toBe(7);
  await writeFile(
    `${assets}/keybindings-export-${info.project.name}.json`,
    file,
  );
  await page.keyboard.press("Escape");
  await page.locator('[data-action="savehome"]').click();
  await page.locator('[data-action="settings"]').click();
  await page.locator(".keyboard-settings summary").click();
  await page.locator('[data-action="resetkeys"]').click();
  const reset = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  expect(reset.settings.keybindings).toBeUndefined();
  expect(reset.run).toEqual(exported.run);
  await page.locator("#save-file").setInputFiles({
    name: "my-keys.json",
    mimeType: "application/json",
    buffer: Buffer.from(file),
  });
  await page.locator('[data-action="importrecord"]').click();
  const imported = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  expect(imported.settings).toEqual(configured);
  expect(imported.run).toEqual(exported.run);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/keybindings-native-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Public settings with native keyboard capture, conflict/cancel/delete/modifier checks, public help, then actual IJKL/F/V/C/B play of the seven-enemy first room and N to the next route. Exact pause, save/reload, public download/reset/import. No actor, position, HP, history or game-clock mutations after departure. Automated input evidence, not a human enjoyment evaluation.",
        configured,
        movement,
        saved,
        exported,
        imported,
        pauseMilliseconds: 300,
        pauseUnchanged: true,
        pausedCanvasSha256: sha(
          Buffer.from(before.world.split(",")[1], "base64"),
        ),
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("旧入力と標準・変更後の4,096条件を照合し、出口のキーだけを描き替える", async ({
  page,
  browserName,
}) => {
  await fresh(page);
  const result = await page.evaluate(async () => {
    const [
      { Input },
      { Input: Before },
      { Game, createRun },
      { Renderer },
      { Renderer: OldRenderer },
    ] = await Promise.all([
      import("/src/input.js"),
      import(
        "/.mdxr/20261007195700-echo-loom/assets/keybindings-baseline-input.mjs"
      ),
      import("/src/game.js"),
      import("/src/render.js"),
      import(
        "/.mdxr/20261007195700-echo-loom/assets/pad-predecessor-render.mjs"
      ),
    ]);
    const mapping = {
      up: ["KeyI", "ArrowUp"],
      down: ["KeyK", "ArrowDown"],
      left: ["KeyJ", "ArrowLeft"],
      right: ["KeyL", "ArrowRight"],
      fire: ["KeyF", "KeyZ"],
      dash: ["KeyV", "Shift"],
      echo: ["KeyC", null],
      burst: ["KeyB", null],
      interact: ["KeyN", null],
    };
    const translated = {
      KeyW: "KeyI",
      KeyS: "KeyK",
      KeyA: "KeyJ",
      KeyD: "KeyL",
      KeyJ: "KeyF",
      Space: "KeyV",
      KeyQ: "KeyC",
      KeyR: "KeyB",
      KeyE: "KeyN",
    };
    const makeCanvas = () => document.createElement("canvas");
    const old = new Before(makeCanvas(), () => {}),
      current = new Input(makeCanvas(), () => {}),
      mapped = new Input(
        makeCanvas(),
        () => {},
        () => mapping,
      );
    const player = { x: 240, y: 150 };
    let conditions = 0,
      comparedReads = 0;
    for (const movement of [
      ["KeyW", "KeyS", "KeyA", "KeyD"],
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
    ])
      for (let mask = 0; mask < 16; mask++)
        for (const fire of [[], ["KeyJ"], ["KeyZ"], ["KeyJ", "KeyZ"]])
          for (const dash of [[], ["Space"], ["ShiftLeft"], ["ShiftRight"]])
            for (const echo of [[], ["KeyQ"]])
              for (const burst of [[], ["KeyR"]])
                for (const interact of [[], ["KeyE"]]) {
                  const codes = [
                    ...movement.filter((_, i) => mask & (1 << i)),
                    ...fire,
                    ...dash,
                    ...echo,
                    ...burst,
                    ...interact,
                  ];
                  for (const input of [old, current]) {
                    input.clear();
                    input.keys = new Set(codes);
                    input.pressed = new Set(codes);
                  }
                  mapped.clear();
                  const remapped = codes.map(
                    (code) => translated[code] || code,
                  );
                  mapped.keys = new Set(remapped);
                  mapped.pressed = new Set(remapped);
                  for (let tick = 0; tick < 2; tick++) {
                    const expected = JSON.stringify(old.read(player));
                    if (
                      JSON.stringify(current.read(player)) !== expected ||
                      JSON.stringify(mapped.read(player)) !== expected
                    )
                      throw new Error(
                        `Input mismatch at condition ${conditions} tick ${tick}`,
                      );
                    comparedReads++;
                  }
                  conditions++;
                }
    const game = new Game(createRun("KEYBINDINGS-EXIT-PIXELS"));
    game.mode = "cleared";
    game.spawnQueue = [];
    game.enemies = [];
    game.t = 1.25;
    const canvas = () => {
      const c = makeCanvas();
      c.width = 960;
      c.height = 600;
      return c;
    };
    const legacy = new OldRenderer(canvas()),
      latest = new Renderer(canvas());
    const saved = localStorage.getItem("echo-loom.save.v1"),
      before = JSON.stringify(game);
    legacy.draw(game, 0, { flashes: false });
    latest.draw(game, 0, { flashes: false });
    const a = legacy.g.getImageData(0, 0, 480, 300).data,
      b = latest.g.getImageData(0, 0, 480, 300).data;
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i]) throw new Error("Default exit pixels changed");
    latest.draw(game, 0, { flashes: false, keybindings: mapping });
    const c = latest.g.getImageData(0, 0, 480, 300).data;
    let changed = 0,
      outside = 0;
    for (let i = 0; i < c.length; i += 4)
      if ([0, 1, 2, 3].some((j) => a[i + j] !== c[i + j])) {
        changed++;
        const x = (i / 4) % 480,
          y = Math.floor(i / 4 / 480);
        if (x < 190 || x > 290 || y < 38 || y > 65) outside++;
      }
    if (
      !changed ||
      outside ||
      JSON.stringify(game) !== before ||
      localStorage.getItem("echo-loom.save.v1") !== saved
    )
      throw new Error("Mapped exit changed unrelated pixels or game/save");
    return {
      conditions,
      comparedReads,
      defaultControlsEqual: true,
      translatedControlsEqual: true,
      exit: {
        defaultPixelsEqual: true,
        mappedChanged: changed,
        outsideChanged: outside,
        gameUnchanged: true,
        saveUnchanged: true,
      },
    };
  });
  expect(result.conditions).toBe(4096);
  expect(result.comparedReads).toBe(8192);
  await writeFile(
    `${assets}/keybindings-input-parity-${browserName}.json`,
    JSON.stringify(
      {
        scope:
          "Controlled standalone old/current Input objects, default keys and translated custom keys, all movement subsets and aliases combined with fire aliases, dash aliases and Q/R/E edges. Two reads each compare every returned control field and edge consumption. Separate actual-native cases cover real event capture/gameplay. Fixed real Game cleared scene proves default exit pixels unchanged and mapped N changes only the exit label; no game ticks or RNG/save mutations.",
        ...result,
      },
      null,
      2,
    ) + "\n",
  );
});

test("変更したキーでも三つの画面でタッチとゲームパッドを使い、練習と停止を保つ", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 360, height: 640 },
  });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__keybindingPad = {
        mapping: "standard",
        connected: true,
        index: 0,
        id: "Standard API test pad",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, () => ({
          pressed: false,
          value: 0,
        })),
      };
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => [window.__keybindingPad],
      });
    });
    await fresh(page);
    await remap(page);
    const settingsLayout = await page
      .locator(".keybinding-row .key-binding")
      .evaluateAll((buttons) =>
        buttons.map((button) => ({
          label: button.getAttribute("aria-label"),
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
          font: Number.parseFloat(getComputedStyle(button).fontSize),
        })),
      );
    expect(
      settingsLayout.every(
        (button) =>
          button.width >= 40 && button.height >= 40 && button.font >= 10,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await page.locator('[data-action="practice"]').click();
    await expect(page.locator("#practice-keys")).toContainText("IJKL");
    const touches = [];
    for (const viewport of [
      { width: 360, height: 640 },
      { width: 640, height: 360 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(
        () =>
          window.__ECHO_LOOM__.game().history.length >= 24 &&
          window.__ECHO_LOOM__.game().player.echoCharges > 0 &&
          window.__ECHO_LOOM__.game().player.dashCd <= 0,
      );
      const button = async (action) => {
        const box = await page
          .locator(`[data-touch-action="${action}"]`)
          .boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(40);
        await page.touchscreen.tap(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
      };
      const casts = await page.evaluate(
        () => window.__ECHO_LOOM__.game().run.echoesCast,
      );
      await button("echo");
      await expect
        .poll(() =>
          page.evaluate(() => window.__ECHO_LOOM__.game().run.echoesCast),
        )
        .toBe(casts + 1);
      await button("dash");
      await expect
        .poll(() =>
          page.evaluate(() => window.__ECHO_LOOM__.game().player.dashCd),
        )
        .toBeGreaterThan(0);
      await button("burst");
      await expect
        .poll(() =>
          page.evaluate(() => window.__ECHO_LOOM__.game().echoes.length),
        )
        .toBe(0);
      await page.getByRole("button", { name: "一時停止", exact: true }).click();
      const before = await frozen(page);
      await page.waitForTimeout(300);
      expect(await frozen(page)).toEqual(before);
      touches.push({
        viewport,
        touchEchoCast: casts + 1,
        touchDash: true,
        touchRelease: true,
        pauseMilliseconds: 300,
        pauseUnchanged: true,
        canvasSha256: sha(Buffer.from(before.world.split(",")[1], "base64")),
      });
      await page
        .getByRole("button", { name: "練習に戻る", exact: true })
        .click();
    }
    const pressPad = async (index) => {
      await page.evaluate(
        (i) =>
          (window.__keybindingPad.buttons[i] = { pressed: true, value: 1 }),
        index,
      );
      await page.waitForTimeout(150);
      await page.evaluate(
        (i) =>
          (window.__keybindingPad.buttons[i] = { pressed: false, value: 0 }),
        index,
      );
      await page.waitForTimeout(150);
    };
    const x = await page.evaluate(() => window.__ECHO_LOOM__.game().player.x);
    await page.evaluate(() => {
      window.__keybindingPad.axes = [0.8, 0, 1, 0];
      window.__keybindingPad.buttons[7] = { pressed: true, value: 1 };
    });
    await page.waitForTimeout(350);
    const moved = await page.evaluate(() => ({
      x: window.__ECHO_LOOM__.game().player.x,
      fired: window.__ECHO_LOOM__.game().history.some((frame) => frame.fire),
    }));
    expect(moved.x).toBeGreaterThan(x);
    expect(moved.fired).toBe(true);
    await page.evaluate(() => {
      window.__keybindingPad.axes = [0, 0, 0, 0];
      window.__keybindingPad.buttons[7] = { pressed: false, value: 0 };
    });
    await page.waitForFunction(
      () => window.__ECHO_LOOM__.game().player.echoCharges > 0,
    );
    const casts = await page.evaluate(
      () => window.__ECHO_LOOM__.game().run.echoesCast,
    );
    await pressPad(5);
    expect(
      await page.evaluate(() => window.__ECHO_LOOM__.game().run.echoesCast),
    ).toBe(casts + 1);
    await pressPad(4);
    expect(
      await page.evaluate(() => window.__ECHO_LOOM__.game().echoes.length),
    ).toBe(0);
    await pressPad(9);
    await expect(
      page.getByRole("heading", { name: "灯りをひと休み" }),
    ).toBeVisible();
    await pressPad(9);
    expect(
      await page.evaluate(() => window.__ECHO_LOOM__.snapshot().paused),
    ).toBe(false);
    if (info.project.name === "chromium")
      await page.screenshot({
        path: `${assets}/keybindings-touch-practice.png`,
      });
    expect(errors).toEqual([]);
    await writeFile(
      `${assets}/keybindings-touch-${info.project.name}.json`,
      JSON.stringify(
        {
          scope:
            "Public custom keyboard settings before the real harmless practice room. Actual native touch taps for Q/R/dash semantics under remapping at three viewports, exact 300ms paused world. Standard Gamepad API input stub supplies axes/RT/RB/LB/Start to the same live practice; no actor, HP, position, history or game-clock edits. This verifies integration with an input stub, not physical gamepad hardware.",
          settingsLayout,
          touches,
          gamepad: {
            moved,
            echoCast: casts + 1,
            release: true,
            pauseResume: true,
          },
          errors,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await context.close();
  }
});

test("報酬の数字キーを次の航路へ持ち越さず、押し直した割り当てを使う", async ({
  page,
  browserName,
}) => {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.settings.keybindings = { interact: ["Digit1", null] };
  profile.run = createRun("NUMERIC-REWARD-BOUNDARY");
  Object.assign(profile.run, {
    stage: 1,
    checkpoint: "reward",
    scrap: 100,
    kills: 7,
    time: 13,
  });
  await page.addInitScript(
    ({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)),
    { key: SAVE_KEY, profile },
  );
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator('[data-action="upgrade"]')).toHaveCount(3);
  // A controlled saved reward and exit position isolate this menu boundary.
  // The actual reward hotkey and subsequent exit still use native key events.
  await page.evaluate(async () => {
    const { Input: Before } = await import(
      "/.mdxr/20261007195700-echo-loom/assets/keybindings-controls-input-baseline.mjs"
    );
    window.__numericBeforeInput = new Before(
      document.createElement("canvas"),
      () => {},
      () => ({ interact: ["Digit1", null] }),
    );
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 240;
    g.player.y = 42;
  });
  await page.keyboard.down("Digit1");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().mode))
    .toBe("cleared");
  await page.waitForTimeout(300);
  await expect(page.locator('[data-action="route"]')).toHaveCount(0);
  const beforeAcceptedMenuKey = await page.evaluate(
    () =>
      window.__numericBeforeInput.read(window.__ECHO_LOOM__.game().player)
        .interact,
  );
  expect(beforeAcceptedMenuKey).toBe(true);
  await expect(page.locator("#notifications")).toContainText("1 で次の航路");
  const afterReward = await page.evaluate(() =>
    window.__ECHO_LOOM__.snapshot(),
  );
  expect(afterReward.run.stage).toBe(1);
  await page.keyboard.up("Digit1");
  await page.keyboard.press("Digit1");
  await expect(page.locator('[data-action="route"]').first()).toBeVisible();
  await page.locator('[data-action="route"]').first().click();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().run.stage))
    .toBe(2);
  await writeFile(
    `${assets}/keybindings-numeric-${browserName}.json`,
    JSON.stringify(
      {
        scope:
          "Controlled saved reward and exit pose before input; native held Digit1 selects a real reward without opening the route, exact mapped toast, release and fresh Digit1 opens the route and reaches stage2. Not an earned native expedition.",
        afterReward,
        heldSelectionStayedCleared: true,
        beforeAcceptedMenuKey,
        toastKey: "1",
        freshPressOpenedRoute: true,
        nextStage: 2,
      },
      null,
      2,
    ) + "\n",
  );
});
