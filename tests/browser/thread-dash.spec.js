import { test, expect } from "@playwright/test";
import { freshProfile } from "../../src/save.js";
import { createRun } from "../../src/game.js";

async function openScene(page, upgrades = {}) {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.run = createRun("BROWSER-DASH-THREAD");
  profile.run.upgrades = upgrades;
  await page.addInitScript(
    (raw) => localStorage.setItem("echo-loom.save.v1", raw),
    JSON.stringify(profile),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    // Isolated positions only. Recording, movement, dash and damage then run
    // through the production frame loop, using actual keyboard events.
    g.spawnQueue = [{ time: Infinity }];
    g.enemies = [];
    g.bullets = [];
    g.player.x = 100;
    g.player.y = 160;
    g.history = [];
  });
}

test("実際に歩いて録画した光糸を回避で払い、直前の命中待ち時間を越えて織り撃つ", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openScene(page, { dashthread: 1 });
  await page.keyboard.down("KeyD");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().player.x))
    .toBeGreaterThan(318);
  await page.keyboard.up("KeyD");
  await page.evaluate(() => {
    const enemy = window.__ECHO_LOOM__.game().spawn("shooter", 200, 160);
    enemy.state = "windup";
    enemy.timer = 1000;
  });
  await page.keyboard.press("KeyQ");
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.game().enemies[0].threadCd),
    )
    .toBeGreaterThan(0);
  const before = await page.evaluate(
    () => window.__ECHO_LOOM__.game().enemies[0].hp,
  );
  await page.keyboard.down("KeyW");
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = window.__ECHO_LOOM__.game();
        return (
          g.player.dashSerial > 0 &&
          g.enemies[0]?.dashThreadHit === g.player.dashSerial
        );
      }),
    )
    .toBe(true);
  const after = await page.evaluate(() => ({
    hp: window.__ECHO_LOOM__.game().enemies[0]?.hp || 0,
    labels: window.__ECHO_LOOM__.game().labels.map((l) => l.text),
  }));
  expect(before - after.hp).toBeGreaterThanOrEqual(13.19);
  expect(after.labels).toContain("織り撃ち");
  await page.screenshot({ path: testInfo.outputPath("dash-thread.png") });
  await page.keyboard.up("KeyW");
  expect(errors).toEqual([]);
});

test("接触の致命傷で帰還した後に、同じフレームの糸が影を倒さない", async ({
  page,
}) => {
  await openScene(page);
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.run.hp = 1;
    g.spawn("crawler", 100, 160).contactCd = 0;
    const enemy = g.spawn("shooter", 200, 160);
    enemy.hp = 1;
    enemy.state = "windup";
    enemy.timer = 0;
    enemy.shotAngles = [0];
    g.echoes = [
      {
        x: 300,
        y: 160,
        elapsed: 0,
        frame: -1,
        frames: Array.from({ length: 60 }, () => ({
          x: 300,
          y: 160,
          angle: 0,
          fire: false,
        })),
      },
    ];
  });
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.snapshot().screen))
    .toBe("defeat");
  const result = await page.evaluate(() => ({
    kills: window.__ECHO_LOOM__.game().run.kills,
    enemyHp: window.__ECHO_LOOM__.game().enemies[1].hp,
    bullets: window.__ECHO_LOOM__.game().bullets.length,
  }));
  expect(result).toEqual({ kills: 0, enemyHp: 1, bullets: 0 });
  await expect(
    page
      .getByText("ほどいた影", { exact: true })
      .locator("..")
      .locator("strong"),
  ).toHaveText("0");
});
