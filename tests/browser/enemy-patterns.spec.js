import { test, expect } from "@playwright/test";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

const artifacts = ".mdxr/20261007195700-echo-loom/assets";
async function scene(page) {
  const p = freshProfile();
  p.attempts = 2;
  p.run = createRun("CORD-INPUT");
  p.run.stage = 8;
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: p },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await page.bringToFront();
  // Isolate the new mechanic; enemy health, attacks and the clock stay real.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.enemies = [];
    g.spawnQueue = [];
    g.history = [];
    g.player.x = 240;
    g.player.y = 42;
    const a = g.spawn("weaver", 150, 65),
      b = g.spawn("shooter", 330, 65);
    a.timer = 0;
    b.timer = 0;
  });
}

test("通常の移動・回避・残響で赤い結びを切り、切断の記録を再開後にも保持する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await scene(page);
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().history.length))
    .toBeGreaterThanOrEqual(24);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/cord-windup.png` });
  await page.keyboard.down("KeyS");
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyS");
  await page.keyboard.press("KeyQ");
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.cordCuts),
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      window.__ECHO_LOOM__.game().hazards.some((h) => h.kind === "cord"),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () =>
        window.__ECHO_LOOM__.game().enemies.find((e) => e.kind === "shooter")
          .state,
    ),
  ).toBe("recover");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/cord-cut.png` });
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    for (const e of [...g.enemies]) g.damageEnemy(e, e.hp, "thread");
  });
  await page.locator('[data-action="upgrade"]').first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.cordCuts),
  ).toBe(1);
  expect(errors).toEqual([]);
});

test("射撃の予兆と狙いは停止中に進まず、横に移動しても固定した方向へ撃つ", async ({
  page,
}, info) => {
  await scene(page);
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.enemies = [];
    g.hazards = [];
    g.player.x = 240;
    g.player.y = 250;
    const shooter = g.spawn("shooter", 240, 65);
    shooter.timer = 0;
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.game().enemies[0].state),
    )
    .toBe("windup");
  await page.keyboard.press("Escape");
  const plan = await page.evaluate(() => {
    const e = window.__ECHO_LOOM__.game().enemies[0];
    return { angles: e.shotAngles, timer: e.timer, x: e.x, y: e.y };
  });
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().enemies[0].timer),
  ).toBe(plan.timer);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down("KeyD");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__ECHO_LOOM__.game().bullets.filter((b) => !b.friendly).length,
      ),
    )
    .toBe(3);
  await page.keyboard.up("KeyD");
  const fired = await page.evaluate(() => ({
    x: window.__ECHO_LOOM__.game().player.x,
    angles: window.__ECHO_LOOM__
      .game()
      .bullets.filter((b) => !b.friendly)
      .map((b) => b.angle),
  }));
  expect(fired.x).toBeGreaterThan(250);
  expect(fired.angles).toEqual(plan.angles);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/shooter-fixed-aim.png` });
});
