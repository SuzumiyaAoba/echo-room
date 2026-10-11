import { gameURL } from "./server-url.js";
import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

const proof = (name, engine, result) =>
  writeFile(
    `${assets}/aim-${name}-${engine}.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
const difference = (a, b) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
async function begin(page) {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.settings.flashes = false;
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: profile },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("AIM-AFTER-PAUSE");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().enemies.length > 0,
  );
}
async function mouseAt(page, point) {
  const box = await page.locator("#world").boundingBox();
  const x = box.x + (point.x * box.width) / 480,
    y = box.y + (point.y * box.height) / 300;
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, {
      x,
      y,
    }),
  ).toBe("world");
  await page.mouse.move(x, y);
}
async function nextShot(page) {
  // Temporarily observe the exact simulation boundary. The wrapper calls the
  // original update once with the same arguments; it does not set actor, HP,
  // history, RNG or clock values. Context disposal removes this instrumentation.
  await page.evaluate(() => {
    const game = window.__ECHO_LOOM__.game();
    if (!window.__aimOriginalUpdate) {
      const prototype = Object.getPrototypeOf(game);
      const original = prototype.update;
      window.__aimOriginalUpdate = original;
      prototype.update = function (dt, controls) {
        const watch = window.__aimWatch;
        const observe = watch && !watch.shot && this.mode === "combat";
        const beforeTime = this.run.time;
        const beforePlayer = observe
          ? { x: this.player.x, y: this.player.y }
          : null;
        const enemies = observe
          ? this.enemies.map(({ id, kind, x, y, hp }) => ({
              id,
              kind,
              x,
              y,
              hp,
            }))
          : [];
        const nearest = enemies.length
          ? enemies.reduce((a, b) =>
              Math.hypot(a.x - beforePlayer.x, a.y - beforePlayer.y) <
              Math.hypot(b.x - beforePlayer.x, b.y - beforePlayer.y)
                ? a
                : b,
            )
          : null;
        const result = original.call(this, dt, controls);
        const h = this.history.at(-1);
        if (observe && nearest && h?.fire && this.run.time > beforeTime)
          watch.shot = {
            shot: { ...h },
            nearest,
            nearestAngle: Math.atan2(
              nearest.y - beforePlayer.y,
              nearest.x - beforePlayer.x,
            ),
            enemiesBeforeUpdate: enemies,
            enemiesAfterUpdate: this.enemies.map(({ id, kind, x, y, hp }) => ({
              id,
              kind,
              x,
              y,
              hp,
            })),
            controls: { ...controls },
            dt,
            beforeTime,
            time: this.run.time,
            hp: this.run.hp,
          };
        return result;
      };
    }
    window.__aimWatch = { shot: null };
  });
  await page.waitForFunction(() => window.__aimWatch.shot !== null);
  const result = await page.evaluate(() => ({
    ...window.__aimWatch.shot,
    source: document.querySelector("#world").dataset.aim,
  }));
  expect(result.time - result.beforeTime).toBeCloseTo(result.dt, 12);
  return result;
}

const frozen = (page) =>
  page.evaluate(
    (key) => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      canvas: document.querySelector("#world").toDataURL(),
      save: localStorage.getItem(key),
    }),
    SAVE_KEY,
  );

test("実際のマウスとJの射撃を保ち、停止・画面外・照準補助の後は敵を狙う", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await begin(page);
  const point = { x: 80, y: 260 };
  await mouseAt(page, point);
  await page.keyboard.down("KeyJ");
  const manual = await nextShot(page);
  await page.keyboard.up("KeyJ");
  expect(manual.source).toBe("mouse");
  const mouseAngle = Math.atan2(
    point.y - manual.shot.y,
    point.x - manual.shot.x,
  );
  expect(difference(manual.shot.angle, mouseAngle)).toBeLessThan(1e-9);
  await expect(page.locator("#aim-status")).toHaveText("マウス照準");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "潮を待つ" })).toBeVisible();
  const paused = await frozen(page);
  await page.waitForTimeout(300);
  expect(await frozen(page)).toEqual(paused);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down("KeyJ");
  const resumed = await nextShot(page);
  await page.keyboard.up("KeyJ");
  expect(resumed.source).toBe("assist");
  expect(resumed.controls.autoAim).toBe(true);
  expect(difference(resumed.shot.angle, resumed.nearestAngle)).toBeLessThan(
    1e-9,
  );
  expect(difference(resumed.shot.angle, mouseAngle)).toBeGreaterThan(1);
  await expect(page.locator("#aim-status")).toHaveText("自動照準");
  await mouseAt(page, { x: 82, y: 260 });
  await page.mouse.down();
  const clicked = await nextShot(page);
  await page.mouse.up();
  expect(clicked.source).toBe("mouse");
  expect(
    difference(
      clicked.shot.angle,
      Math.atan2(260 - clicked.shot.y, 82 - clicked.shot.x),
    ),
  ).toBeLessThan(1e-9);
  if (browserName === "chromium")
    await page.screenshot({ path: `${assets}/aim-manual.png` });
  await page.mouse.move(5, 5);
  await page.keyboard.down("KeyJ");
  const left = await nextShot(page);
  await page.keyboard.up("KeyJ");
  expect(left.source).toBe("assist");
  expect(left.controls.autoAim).toBe(true);
  expect(difference(left.shot.angle, left.nearestAngle)).toBeLessThan(1e-9);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-autoAim").check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await mouseAt(page, point);
  await page.mouse.down();
  const assisted = await nextShot(page);
  await page.mouse.up();
  expect(assisted.source).toBe("assist");
  expect(assisted.controls.autoAim).toBe(true);
  expect(difference(assisted.shot.angle, assisted.nearestAngle)).toBeLessThan(
    1e-9,
  );
  expect(difference(assisted.shot.angle, mouseAngle)).toBeGreaterThan(1);
  await expect(page.locator("#aim-status")).toHaveText("自動照準");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).settings.autoAim,
      SAVE_KEY,
    ),
  ).toBe(true);
  if (browserName === "chromium")
    await page.screenshot({ path: `${assets}/aim-assist.png` });
  expect(errors).toEqual([]);
  await proof("native", browserName, {
    scope:
      "Public fresh route and natural first enemies; native mouse/keyboard firing, exact 300 ms paused game/canvas/save equality, public assistance setting. Temporary per-update diagnostic observer calls the original Game.update exactly once with the same arguments; records nearest before the tick and actual fired history after it. No actor, HP, history, RNG or clock value writes.",
    manual,
    resumed,
    clicked,
    left,
    assisted,
    pausedUnchanged: true,
    errors,
  });
});

async function fixture(page) {
  await page.route("**/aim-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body style="margin:0"><canvas id="aim-canvas" width="960" height="600" style="position:absolute;left:100px;top:80px;width:720px;height:450px"></canvas></body></html>',
    }),
  );
  await page.goto("/aim-fixture");
  await page.evaluate(async () => {
    const [{ Input }, { Input: Before }] = await Promise.all([
      import("/src/input.js"),
      import("/tests/fixtures/reference/aim-baseline-input.mjs"),
    ]);
    const canvas = document.querySelector("canvas");
    const current = new Input(canvas, () => current.clear());
    const before = new Before(canvas, () => before.clear());
    window.__aimFixture = { current, before, player: { x: 240, y: 150 } };
  });
}
const readFixture = (page) =>
  page.evaluate(() => {
    const { current, before, player } = window.__aimFixture;
    return {
      current: current.read(player),
      before: before.read(player),
      mouse: { ...current.mouse },
      intent: current.aimView(),
    };
  });

test("拡大したCanvasで押下位置とドラッグを読み、離す・キャンセル・ぼかしで照準を解除する", async ({
  page,
  browserName,
}) => {
  await fixture(page);
  const events = [];
  await page.mouse.move(220, 410);
  const hover = await readFixture(page);
  events.push({ name: "native hover", ...hover });
  expect(hover.mouse.x).toBeCloseTo(80, 8);
  expect(hover.mouse.y).toBeCloseTo(220, 8);
  expect(hover.current).toEqual(hover.before);
  await page.keyboard.down("KeyJ");
  await page.keyboard.down("KeyW");
  const hybrid = await readFixture(page);
  events.push({ name: "native mouse + keyboard", ...hybrid });
  expect(hybrid.current).toEqual(hybrid.before);
  expect(hybrid.current).toMatchObject({ fire: true, my: -1, autoAim: false });
  await page.keyboard.up("KeyJ");
  await page.keyboard.up("KeyW");
  await page.mouse.move(20, 20);
  const leave = await readFixture(page);
  events.push({ name: "native leave", ...leave });
  expect(leave.current.autoAim).toBe(true);
  expect(leave.before.autoAim).toBe(false);
  await page.mouse.move(250, 230);
  await page.mouse.down();
  const capture = await readFixture(page);
  events.push({ name: "native down", ...capture });
  expect(capture.current.fire).toBe(true);
  expect(
    await page.evaluate(() =>
      document
        .querySelector("canvas")
        .hasPointerCapture(window.__aimFixture.current.mouse.pointer),
    ),
  ).toBe(true);
  await page.mouse.move(920, 600);
  const dragged = await readFixture(page);
  events.push({ name: "native captured drag outside", ...dragged });
  expect(dragged.current).toMatchObject({ fire: true, autoAim: false });
  expect(dragged.mouse.x).toBeCloseTo(546.6666666667, 6);
  expect(dragged.mouse.y).toBeCloseTo(346.6666666667, 6);
  await page.mouse.up();
  const released = await readFixture(page);
  events.push({ name: "native outside release", ...released });
  expect(released.current).toMatchObject({ fire: false, autoAim: true });
  expect(released.mouse.pointer).toBe(null);
  await page.mouse.move(350, 260);
  await page.keyboard.press("Escape");
  const paused = await readFixture(page);
  events.push({ name: "native Escape callback clear", ...paused });
  expect(paused.current.autoAim).toBe(true);
  expect(paused.before.autoAim).toBe(false);
  await page.mouse.move(351, 260);
  await page.mouse.down();
  await page.evaluate(() => {
    const id = window.__aimFixture.current.mouse.pointer;
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        pointerId: id,
        pointerType: "mouse",
      }),
    );
  });
  const cancelled = await readFixture(page);
  events.push({
    name: "synthetic pointercancel of a native held pointer",
    ...cancelled,
  });
  expect(cancelled.current).toMatchObject({ fire: false, autoAim: true });
  await page.mouse.up();
  await page.mouse.move(352, 260);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const blurred = await readFixture(page);
  events.push({ name: "synthetic window blur", ...blurred });
  expect(blurred.current.autoAim).toBe(true);
  await page.evaluate(() =>
    document.querySelector("canvas").dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 700,
        clientY: 380,
        pointerId: 41,
        pointerType: "mouse",
        button: 0,
        bubbles: true,
      }),
    ),
  );
  const clickOnly = await readFixture(page);
  events.push({ name: "synthetic click with no preceding move", ...clickOnly });
  expect(clickOnly.mouse.x).toBeCloseTo(400, 8);
  expect(clickOnly.mouse.y).toBeCloseTo(200, 8);
  expect(clickOnly.current).toMatchObject({ fire: true, autoAim: false });
  expect(clickOnly.current.angle).toBeCloseTo(Math.atan2(50, 160), 12);
  expect(clickOnly.before.autoAim).toBe(false);
  expect(clickOnly.before.angle).not.toBeCloseTo(clickOnly.current.angle, 2);
  await proof("pointer", browserName, {
    scope:
      "Standalone old/current Input share a real scaled Canvas. Native Playwright pointer/keyboard capture and drag; cancellation, blur and no-move click are explicitly synthetic lifecycle checks.",
    events,
  });
});

test("スティックが古いマウス照準を解除し、三画面の実際の右パッドで方向と停止を保つ", async ({
  page: fixturePage,
  browser,
  browserName,
}) => {
  let page = fixturePage;
  let touchContext;
  try {
    await fixture(page);
    const priorities = [];
    await page.mouse.move(220, 410);
    await page.evaluate(() => {
      window.__aimPad = null;
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => (window.__aimPad ? [window.__aimPad] : []),
      });
      window.__aimPad = {
        mapping: "standard",
        connected: true,
        index: 0,
        id: "Standard API test pad",
        axes: [0.5, -0.25, 0, 0],
        buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
      };
    });
    const idle = await readFixture(page);
    priorities.push({ name: "API pad movement keeps mouse", ...idle });
    expect(idle.current).toEqual(idle.before);
    expect(idle.intent.source).toBe("mouse");
    await page.evaluate(() => {
      window.__aimPad.axes[2] = 0.8;
      window.__aimPad.axes[3] = -0.6;
      window.__aimPad.buttons[7].pressed = true;
    });
    const aimed = await readFixture(page);
    priorities.push({ name: "API pad explicit right stick", ...aimed });
    expect(aimed.current).toEqual(aimed.before);
    expect(aimed.intent.source).toBe("pad");
    expect(aimed.current.angle).toBeCloseTo(Math.atan2(-0.6, 0.8), 12);
    await page.evaluate(() => {
      window.__aimPad.axes[2] = 0;
      window.__aimPad.axes[3] = 0;
    });
    const neutral = await readFixture(page);
    priorities.push({
      name: "API pad neutral returns to assistance",
      ...neutral,
    });
    expect(neutral.current).toEqual({ ...neutral.before, autoAim: true });
    expect(neutral.current.fire).toBe(true);
    expect(neutral.intent.source).toBe("assist");
    await page.evaluate(() => {
      window.__aimPad = null;
    });
    await page.mouse.move(221, 410);
    await page.evaluate(() => {
      for (const input of [
        window.__aimFixture.current,
        window.__aimFixture.before,
      ])
        Object.assign(input.touch, {
          fire: true,
          ax: -0.6,
          ay: 0.8,
          mx: 0.2,
          my: 0.3,
        });
    });
    const touch = await readFixture(page);
    priorities.push({ name: "controlled touch right stick", ...touch });
    expect(touch.current).toEqual(touch.before);
    expect(touch.intent.source).toBe("touch");
    await page.evaluate(() => {
      for (const input of [
        window.__aimFixture.current,
        window.__aimFixture.before,
      ])
        input.touch.fire = false;
    });
    const touchNeutral = await readFixture(page);
    priorities.push({
      name: "controlled touch neutral returns to assistance",
      ...touchNeutral,
    });
    expect(touchNeutral.current).toEqual({
      ...touchNeutral.before,
      autoAim: true,
    });
    touchContext = await browser.newContext({
      hasTouch: true,
      baseURL: gameURL,
      viewport: { width: 1200, height: 850 },
    });
    page = await touchContext.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "灯りの練習" }).click();
    const layouts = [];
    for (const [width, height] of [
      [360, 640],
      [640, 360],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      const stick = page.locator('[data-stick="aim"]');
      await expect(stick).toBeVisible();
      const box = await stick.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.25);
      await page.waitForFunction(
        () => document.querySelector("#world").dataset.aim === "touch",
      );
      const aimed = await page.evaluate(() => ({
        source: document.querySelector("#world").dataset.aim,
        angle: window.__ECHO_LOOM__.game().player.angle,
        history: window.__ECHO_LOOM__.game().history.at(-1),
        box: (() => {
          const r = document
            .querySelector('[data-stick="aim"]')
            .getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })(),
      }));
      expect(aimed.source).toBe("touch");
      expect(difference(aimed.angle, Math.atan2(-0.25, 0.3))).toBeLessThan(
        0.08,
      );
      expect(aimed.box.width).toBeGreaterThanOrEqual(40);
      expect(aimed.box.height).toBeGreaterThanOrEqual(40);
      if (browserName === "chromium")
        await page.screenshot({
          path: `${assets}/aim-touch-${width}x${height}.png`,
        });
      await page.mouse.up();
      await page.waitForFunction(
        () => document.querySelector("#world").dataset.aim !== "touch",
      );
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("heading", { name: "灯りをひと休み" }),
      ).toBeVisible();
      const before = await frozen(page);
      await page.waitForTimeout(300);
      expect(await frozen(page)).toEqual(before);
      if (browserName === "chromium")
        await page.screenshot({
          path: `${assets}/aim-touch-paused-${width}x${height}.png`,
        });
      await page
        .getByRole("button", { name: "練習に戻る", exact: true })
        .click();
      layouts.push({ width, height, aimed, pausedUnchanged: true });
    }
    await proof("sticks", browserName, {
      scope:
        "Gamepad and initial touch priorities use controlled API data, not physical hardware. Three public practice layouts use native mouse pointer capture on the real touch right stick; they are not physical multitouch tests. Exact 300 ms paused game/canvas/save equality on each layout.",
      priorities,
      layouts,
    });
  } finally {
    await touchContext?.close();
  }
});

test("旧描画と照合し、照準だけの小さな画素範囲以外とゲーム・保存を保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [
      { Renderer },
      { Renderer: Before },
      { Game, createRun },
      { aimCue },
    ] = await Promise.all([
      import("/src/render.js"),
      import("/tests/fixtures/reference/pad-predecessor-render.mjs"),
      import("/src/game.js"),
      import("/src/aim-feedback.js"),
    ]);
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      return c;
    };
    const current = new Renderer(canvas()),
      before = new Before(canvas());
    const g = new Game(createRun("AIM-PIXELS"));
    for (let i = 0; i < 70; i++) g.update(1 / 60, {});
    // The scheduled-arrival overlay has its own paired rendering checks.
    // This controlled scene isolates aim cues over the same actor floor.
    g.spawnQueue = [];
    const settings = { shake: false, flashes: false },
      saved = localStorage.getItem("echo-loom.save.v1");
    const cases = [],
      readyCases = [];
    // Keep the historical exact comparison without the separately verified
    // recording overlay; also check aim over the current ready-to-cast floor.
    for (const charges of [0, 1]) {
      g.player.echoCharges = charges;
      for (let index = 0; index < 32; index++) {
        g.player.angle = (index * Math.PI) / 16;
        before.draw(g, 0, settings);
        current.draw(g, 0, settings);
        const old = (charges ? current : before).g.getImageData(
          0,
          0,
          480,
          300,
        ).data;
        const compare = (cue) => {
          const snapshot = JSON.stringify(g);
          current.draw(g, 0, settings, {}, cue);
          const actual = current.g.getImageData(0, 0, 480, 300).data;
          let changed = 0,
            outside = 0;
          for (let i = 0; i < old.length; i += 4)
            if ([0, 1, 2, 3].some((j) => old[i + j] !== actual[i + j])) {
              changed++;
              const x = (i / 4) % 480,
                y = Math.floor(i / 4 / 480);
              const direction =
                Math.abs(x - g.player.x) <= 24 &&
                Math.abs(y - g.player.y) <= 24;
              const cursor =
                cue?.point &&
                Math.abs(x - cue.point.x) <= 8 &&
                Math.abs(y - cue.point.y) <= 8;
              if (!direction && !cursor) outside++;
            }
          if (
            JSON.stringify(g) !== snapshot ||
            localStorage.getItem("echo-loom.save.v1") !== saved
          )
            throw Error("Aim drawing changed game, RNG or save");
          return { changed, outside };
        };
        const untouched = compare(null);
        if (untouched.changed)
          throw Error(
            "Default four-argument drawing differs from old renderer",
          );
        for (const source of ["mouse", "pad", "touch", "assist"])
          for (const force of [false, true]) {
            const cue = aimCue(
              g,
              { source, x: 80.5, y: 260.25 },
              { autoAim: force },
            );
            const pixels = compare(cue);
            if (!pixels.changed || pixels.outside)
              throw Error("Aim missing or unrelated pixels changed");
            (charges ? readyCases : cases).push({
              index,
              source,
              force,
              ...pixels,
            });
          }
      }
    }
    g.player.echoCharges = 0;
    const hidden = [];
    for (const mode of ["reward", "cleared", "dead", "event"]) {
      g.mode = mode;
      before.draw(g, 0, settings);
      current.draw(
        g,
        0,
        settings,
        {},
        aimCue(g, { source: "mouse", x: 80, y: 260 }),
      );
      const a = before.g.getImageData(0, 0, 480, 300).data,
        b = current.g.getImageData(0, 0, 480, 300).data;
      if (a.some((v, i) => v !== b[i]))
        throw Error(`Noncombat pixels changed: ${mode}`);
      hidden.push(mode);
    }
    return {
      cases,
      readyCases,
      hidden,
      oldWithoutCueEqual: true,
      gameRngSaveUnchanged: true,
    };
  });
  expect(result.cases).toHaveLength(256);
  expect(result.readyCases).toHaveLength(256);
  expect(result.cases.every((c) => c.outside === 0 && c.changed > 0)).toBe(
    true,
  );
  expect(result.readyCases.every((c) => c.outside === 0 && c.changed > 0)).toBe(
    true,
  );
  await proof("pixels", browserName, {
    scope:
      "Controlled deterministic Game scene, 32 prescribed angles × four intent sources × assistance setting. Without a held echo, the historical default pixels remain exact. With a held echo, the current no-cue floor including the actual recording is the baseline. Both sets confine aim differences to player ±24 and mouse point ±8, with game/RNG/save immutable during drawing. These are renderer comparisons, not earned combat.",
    ...result,
  });
});
