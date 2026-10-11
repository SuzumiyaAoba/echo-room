import { test, expect } from "@playwright/test";
import { createRun } from "../../src/game.js";
import { freshProfile } from "../../src/save.js";

test("三つ目の残響の内側へ攻撃し、攻撃と同じ領域をドットで表示する", async ({
  page,
}, testInfo) => {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.run = createRun("BROWSER-TRIANGLES");
  profile.run.upgrades = { double: 2 };
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (raw) => localStorage.setItem("echo-loom.save.v1", raw),
    JSON.stringify(profile),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.enemies = [];
    g.bullets = [];
    g.spawnQueue = [{ time: Infinity }];
    g.player.x = 100;
    g.player.y = 100;
    g.echoes = [
      { x: 300, y: 100 },
      { x: 100, y: 240 },
      { x: 400, y: 240 },
    ].map((p) => ({
      ...p,
      elapsed: 0,
      frame: -1,
      frames: Array.from({ length: 216 }, () => ({
        ...p,
        angle: 0,
        fire: false,
      })),
    }));
    const enemy = g.spawn("shooter", 340, 180);
    enemy.state = "windup";
    enemy.timer = 1000;
    enemy.threadCd = 0.9;
  });
  const pixel = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              resolve([
                ...document
                  .querySelector("canvas")
                  .getContext("2d")
                  .getImageData(640, 314, 1, 1).data,
              ]),
            ),
          ),
        ),
    );
  const before = await pixel();
  await page.evaluate(() => window.__ECHO_LOOM__.game().addUpgrade("triangle"));
  const after = await pixel();
  expect(after[1]).toBeGreaterThan(before[1] + 10);
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().enemies[0].hp))
    .toBeLessThan(35);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().triangles().length),
  ).toBe(3);
  await page.screenshot({ path: testInfo.outputPath("triangle-regions.png") });
  expect(errors).toEqual([]);
});
