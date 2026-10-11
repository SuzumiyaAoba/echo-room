import { artifactPath } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

async function start(page, windup = false) {
  const profile = freshProfile();
  profile.run = createRun("BROWSER-MEMORY-WARD");
  profile.run.stage = 23;
  profile.run.upgrades.double = 1;
  profile.settings.flashes = false;
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: SAVE_KEY,
    raw: JSON.stringify(profile),
  });
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await page.waitForFunction(() => window.__ECHO_LOOM__.game().boss);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  // Controlled geometry isolates shield rules; Q/R, the shield clock and
  // attack preparation still run through native input and the real game loop.
  await page.evaluate(
    ({ windup }) => {
      const g = window.__ECHO_LOOM__.game(),
        e = g.boss;
      g.enemies = [e];
      g.spawnQueue = [];
      g.bullets = [];
      e.x = 240;
      e.y = 156;
      e.timer = windup ? 0 : 2.4;
      // Both recorded endpoints are inside the actual burst radius. The full
      // 3.6-second history keeps a beam across the boss for at least 0.65s;
      // replaying its later player frames still permits a second release.
      g.player.x = 185;
      g.player.y = 156;
      g.history = Array.from({ length: 216 }, () => ({
        x: 275,
        y: 156,
        angle: 0,
        fire: false,
      }));
    },
    { windup },
  );
}

const snapshot = (page) =>
  page.evaluate((key) => {
    const g = window.__ECHO_LOOM__.game(),
      e = g.boss;
    return {
      time: g.run.time,
      open: e.wardOpen,
      weaving: e.wardWeave,
      timer: e.timer,
      text: document.querySelector("#boss-ward-state").textContent,
      saved: localStorage.getItem(key),
    };
  }, SAVE_KEY);

test("Qの光糸を保って盾をほどき、進捗と開いた時間は一時停止中に止まる", async ({
  page,
  browserName,
}, testInfo) => {
  await start(page);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.evaluate(() => {
    // This controlled partial-progress fixture must pause inside the natural
    // 0.65s window. A client round trip can outlast it under native tracing.
    // Invoke the public pause button from RAF; do not alter simulation clocks
    // or shield values. Q and the later opened-shield pause remain native.
    function watch() {
      const e = window.__ECHO_LOOM__.game().boss;
      if (e.wardWeave >= 0.2) {
        window.__memoryWeavePause = {
          weaving: e.wardWeave,
          open: e.wardOpen,
          time: window.__ECHO_LOOM__.game().run.time,
        };
        document.querySelector('[data-action="pause"]').click();
      } else requestAnimationFrame(watch);
    }
    requestAnimationFrame(watch);
  });
  await page.keyboard.press("KeyQ");
  await expect(
    page.getByRole("heading", { name: "潮を待つ", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.locator("#boss-ward")).toHaveAttribute(
    "data-state",
    "weaving",
  );
  const partial = await snapshot(page);
  const trigger = await page.evaluate(() => window.__memoryWeavePause);
  expect(trigger.weaving).toBeGreaterThanOrEqual(0.2);
  expect(trigger.weaving).toBeLessThan(0.65);
  expect(trigger.open).toBe(0);
  expect(partial.weaving).toBe(trigger.weaving);
  expect(partial.time).toBe(trigger.time);
  await page.waitForTimeout(350);
  expect(await snapshot(page)).toEqual(partial);
  await page.screenshot({
    path: testInfo.outputPath("memory-ward-weaving.png"),
  });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await expect(page.locator("#boss-ward")).toHaveAttribute(
    "data-state",
    "open",
  );
  await expect(page.locator("#boss-ward-state")).toContainText("盾がほどけた");
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.waitForTimeout(150);
  const opened = await snapshot(page);
  expect(opened.open).toBeGreaterThan(0);
  await page.waitForTimeout(350);
  expect(await snapshot(page)).toEqual(opened);
  await page.screenshot({ path: testInfo.outputPath("memory-ward-open.png") });
  await writeFile(
    artifactPath(`echo-ability-memory-weave-${browserName}.json`),
    JSON.stringify(
      {
        scope:
          "Existing controlled geometry/history; native public Q and resume. The first partial-progress pause is a public DOM button click dispatched by a real RAF watcher, to avoid client round trips missing the natural 0.65s interval. No clock/shield/actor values are written by the watcher. The later open-shield pause uses native input. Both 350ms snapshots preserve actual shield/time/save.",
        trigger,
        partial,
        opened,
      },
      null,
      2,
    ) + "\n",
  );
});

test("QとRの解放で盾を開いても、予告した攻撃名・残り時間と実際の発射を保つ", async ({
  page,
  browserName,
}) => {
  await start(page, true);
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    const observation = (window.__memoryBurstObservation = {});
    const model = () => ({
      state: g.boss.state,
      plan: structuredClone(g.boss.plan),
      timer: g.boss.timer,
      open: g.boss.wardOpen,
      time: g.run.time,
      bullets: g.bullets.filter((b) => !b.friendly).length,
    });
    const release = g.release;
    g.release = function (...args) {
      const before = model();
      const result = Reflect.apply(release, this, args);
      observation.release = { before, after: model() };
      return result;
    };
    const update = g.update;
    g.update = function (...args) {
      const before = model();
      const result = Reflect.apply(update, this, args);
      const after = model();
      if (
        observation.release &&
        !observation.fired &&
        before.state === "windup" &&
        after.state === "recover" &&
        after.bullets > before.bullets
      )
        observation.fired = { before, after };
      // The client may receive a key response after the short warning ended.
      // Observe the actual public HUD after its RAF, without pausing, extending
      // the warning or changing any game/input/clock values. Original methods
      // execute exactly once with their original receiver and arguments.
      queueMicrotask(() => {
        if (!observation.release) return;
        const e = g.boss;
        const clock = document.querySelector("#boss-telegraph");
        const ward = document.querySelector("#boss-ward");
        if (ward.dataset.state !== "open") return;
        const hud = {
          intent: document.querySelector("#boss-intent").textContent,
          countdown: document.querySelector("#boss-countdown").textContent,
          hidden: clock.hidden,
          label: clock.getAttribute("aria-label"),
          progress: Number(clock.getAttribute("aria-valuenow")),
          model: model(),
        };
        if (e.state === "windup" && !clock.hidden && !observation.warningHud)
          observation.warningHud = hud;
        if (e.state === "recover" && clock.hidden && !observation.firedHud)
          observation.firedHud = hud;
      });
      return result;
    };
  });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#boss-telegraph").hidden &&
      document
        .querySelector("#boss-intent")
        .textContent.includes("戻らない時計"),
  );
  await page.keyboard.press("KeyQ");
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () =>
      window.__memoryBurstObservation.warningHud &&
      window.__memoryBurstObservation.fired &&
      window.__memoryBurstObservation.firedHud,
  );
  const result = await page.evaluate(() => window.__memoryBurstObservation);
  const { before, after } = result.release;
  expect(before.state).toBe("windup");
  expect(before.plan.name).toBe("戻らない時計");
  expect(before.timer).toBeGreaterThan(0);
  expect(before.open).toBe(0);
  expect(after.state).toBe(before.state);
  expect(after.plan).toEqual(before.plan);
  expect(after.timer).toBe(before.timer);
  expect(after.time).toBe(before.time);
  expect(after.open).toBe(3);
  expect(result.warningHud.intent).toContain(before.plan.name);
  expect(result.warningHud.label).toContain(before.plan.name);
  expect(result.warningHud.countdown).toMatch(/^発動まで \d\.\d秒$/);
  expect(result.warningHud.hidden).toBe(false);
  expect(result.warningHud.model.timer).toBeGreaterThan(0);
  expect(result.warningHud.progress).toBeGreaterThanOrEqual(0);
  expect(result.warningHud.progress).toBeLessThanOrEqual(100);
  expect(result.fired.before.plan).toEqual(before.plan);
  expect(result.fired.after.bullets).toBeGreaterThan(
    result.fired.before.bullets,
  );
  expect(result.fired.after.time).toBeGreaterThan(after.time);
  expect(result.firedHud.hidden).toBe(true);
  expect(result.firedHud.model.plan).toEqual(before.plan);
  expect(result.firedHud.model.open).toBeGreaterThan(0);
  await writeFile(
    artifactPath(`echo-ability-memory-ward-${browserName}.json`),
    JSON.stringify(
      {
        scope:
          "Existing controlled shield geometry, native public Q/R and natural 0.85s boss warning. Read-only per-release/per-update observers call original methods exactly once with identical arguments and receivers; capture public HUD after real RAF. No game, clock, HP, history, warning-duration or input values are changed by the observer. Attack plan/timer remain exact at release and the same plan really fires afterward.",
        ...result,
      },
      null,
      2,
    ) + "\n",
  );
});

test("640幅のタッチ画面で攻撃予告と盾を同時に読み、実際のQとRでほどく", async ({
  browser,
  browserName,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  const page = await context.newPage();
  try {
    await start(page, true);
    await page.getByRole("button", { name: "航路へ戻る", exact: true }).tap();
    await expect(page.locator("#boss-telegraph")).toBeVisible();
    await expect(page.locator("#boss-ward")).toHaveAttribute(
      "data-state",
      "closed",
    );
    for (const selector of [
      "#bossbar",
      "#boss-intent",
      "#boss-ward",
      "#boss-telegraph",
    ]) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(640);
      expect(box.y + box.height).toBeLessThanOrEqual(360);
      expect(
        await page
          .locator(selector)
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await page.locator('[data-touch-key="KeyQ"]').tap();
    await page.locator('[data-touch-key="KeyR"]').tap();
    await expect(page.locator("#boss-ward")).toHaveAttribute(
      "data-state",
      "open",
    );
    await page.getByRole("button", { name: "一時停止", exact: true }).tap();
    await page.waitForTimeout(150);
    const dock = await page.locator(".action-dock").boundingBox();
    const boss = await page.locator("#bossbar").boundingBox();
    expect(boss.y + boss.height).toBeLessThan(dock.y);
    await page.screenshot({
      path: testInfo.outputPath("memory-ward-touch.png"),
    });
  } finally {
    await context.close();
  }
});

test("三秒後には元の盾へ戻り、部屋を再開すると入口からの盾と表示になる", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.press("KeyQ");
  await page.keyboard.press("KeyR");
  await expect(page.locator("#boss-ward")).toHaveAttribute(
    "data-state",
    "open",
  );
  await expect(page.locator("#boss-ward")).toHaveAttribute(
    "data-state",
    "closed",
  );
  await page.keyboard.press("KeyQ");
  await page.keyboard.press("KeyR");
  await expect(page.locator("#boss-ward")).toHaveAttribute(
    "data-state",
    "open",
  );
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("#bossbar")).toBeVisible();
  await expect(page.locator("#boss-ward")).toHaveAttribute(
    "data-state",
    "closed",
  );
  expect((await snapshot(page)).open).toBe(0);
});
