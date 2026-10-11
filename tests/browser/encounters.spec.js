import { test, expect } from "@playwright/test";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

async function resumeRoom(page, stage, cleared = false) {
  const data = freshProfile();
  data.run = createRun("BROWSER-ENCOUNTER");
  data.run.stage = stage;
  data.run.checkpoint = cleared ? "cleared" : "entry";
  data.attempts = 2;
  // Install a checkpoint before application startup, as a fresh browser would.
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key: SAVE_KEY, data },
  );
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await page.bringToFront();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().history.length))
    .toBeGreaterThan(24);
}

test("光糸で係留灯を修復し、報酬と修復済みの部屋が再開後も残る", async ({
  page,
}) => {
  await resumeRoom(page, 1, true);
  for (let index = 0; index < 2; index++) {
    // Position the test at a lamp; recording, movement and Q use real frames
    // and keyboard input, rather than assigning charge or invoking repairs.
    await page.evaluate((index) => {
      const g = window.__ECHO_LOOM__.game(),
        node = g.apparatus.objects[index];
      g.player.x = node.x - 42;
      g.player.y = node.y;
      g.history = [];
      g.echoes = [];
      g.player.echoCharges = 1;
    }, index);
    await expect
      .poll(() =>
        page.evaluate(() => window.__ECHO_LOOM__.game().history.length),
      )
      .toBeGreaterThan(100);
    await page.keyboard.down("KeyD");
    await expect
      .poll(
        () =>
          page.evaluate((index) => {
            const g = window.__ECHO_LOOM__.game();
            return g.player.x - g.apparatus.objects[index].x;
          }, index),
        { intervals: [50] },
      )
      .toBeGreaterThan(35);
    await page.keyboard.up("KeyD");
    await page.keyboard.press("KeyQ");
    await expect
      .poll(
        () =>
          page.evaluate(
            (index) => window.__ECHO_LOOM__.game().apparatus.objects[index].lit,
            index,
          ),
        { intervals: [100] },
      )
      .toBe(true);
  }
  await expect(page.locator("#apparatus-status")).toContainText("2/2");
  const before = await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run);
  expect(before.memory).toBe(3);
  expect(before.scrap).toBe(8);
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("#apparatus-status")).toContainText("2/2");
  const restored = await page.evaluate(() => window.__ECHO_LOOM__.game());
  expect(restored.run.repairs).toEqual([1]);
  expect(restored.run.memory).toBe(3);
  expect(restored.mode).toBe("cleared");
});

test("ボスの予告が攻撃名と避け方を表示し、停止中は進行しない", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await resumeRoom(page, 7);
  await expect(page.locator("#boss-intent")).toContainText(/船灯の輪.*隙間/, {
    timeout: 15000,
  });
  await page.keyboard.press("Escape");
  const before = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      state: g.boss.state,
      timer: g.boss.timer,
      bullets: g.bullets.length,
    };
  });
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => {
      const g = window.__ECHO_LOOM__.game();
      return {
        state: g.boss.state,
        timer: g.boss.timer,
        bullets: g.bullets.length,
      };
    }),
  ).toEqual(before);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().boss.state))
    .toBe("recover");
  await expect(page.locator("#boss-intent")).toContainText("攻撃の隙");
  expect(errors).toEqual([]);
});
