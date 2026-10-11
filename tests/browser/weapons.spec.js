import { test, expect } from "@playwright/test";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

const artifacts = ".mdxr/20261007195700-echo-loom/assets";
async function scene(page, weapon) {
  const p = freshProfile();
  p.attempts = 2;
  p.unlocked.push(weapon);
  p.run = createRun("WEAPON-INPUT", weapon);
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
  // Isolate the mechanic; movement recordings and shots still use native input.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.enemies = [];
    g.hazards = [];
    g.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 65 }];
    g.history = [];
    g.player.x = 180;
    g.player.y = 160;
    for (const row of g.tiles)
      for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  });
}
async function aim(page, x, y) {
  const box = await page.locator("#world").boundingBox();
  await page.mouse.move(
    box.x + (x * box.width) / 480,
    box.y + (y * box.height) / 300,
  );
}

test("実際の移動の残響をレンズにして硝子針を分け、分光の記録を保存・再開する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await scene(page, "prism");
  await page.keyboard.down("KeyD");
  try {
    await page.waitForFunction(
      () => window.__ECHO_LOOM__.game().player.x >= 320,
      null,
      { polling: "raf", timeout: 5000 },
    );
  } finally {
    await page.keyboard.up("KeyD");
  }
  // Finish pointer setup before casting, so a slow browser command cannot use
  // up the short distance between the recorded echo and its moving owner.
  await aim(page, 70, 160);
  await page.keyboard.press("KeyQ");
  await page.mouse.down();
  const capture = await page.waitForFunction(
    () => {
      const g = window.__ECHO_LOOM__.game();
      return g.run.prismSplits > 0
        ? {
            count: g.run.prismSplits,
            fragments: g.bullets.filter((b) => b.fragment),
            source: g.bullets.find((b) => b.prismatic),
          }
        : false;
    },
    null,
    { timeout: 5000 },
  );
  const result = await capture.jsonValue();
  await page.mouse.up();
  expect(result.count).toBe(1);
  expect(result.fragments).toHaveLength(2);
  expect(result.fragments[0].damage).toBeCloseTo(result.source.damage * 0.3);
  expect(result.fragments[1].damage).toBeCloseTo(result.source.damage * 0.3);
  expect(
    Math.abs(result.fragments[0].angle - result.fragments[1].angle),
  ).toBeCloseTo((Math.PI * 2) / 9);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/prism-refraction.png` });
  // The final instant kill only settles this fixture to test the real save UI.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.spawnQueue = [];
    const enemy = g.spawn("crawler", 400, 70);
    g.damageEnemy(enemy, enemy.hp, "shot");
  });
  await page.locator('[data-action="upgrade"]').first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.prismSplits),
  ).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("潮騒は遠い敵へ届かず、通常の移動で近づけば五つの散弾を当てられる", async ({
  page,
}, info) => {
  await scene(page, "scatter");
  const hp = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.player.x = 80;
    const enemy = g.spawn("shooter", 370, 160);
    enemy.timer = 10;
    return enemy.hp;
  });
  await aim(page, 420, 160);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(800);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().enemies[0].hp),
  ).toBe(hp);
  expect(
    await page.evaluate(
      () =>
        window.__ECHO_LOOM__.game().bullets.filter((b) => b.friendly).length,
    ),
  ).toBe(0);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1400);
  await page.keyboard.up("KeyD");
  await aim(page, 420, 160);
  await page.mouse.down();
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.game().enemies[0]?.hp || 0),
    )
    .toBeLessThan(hp);
  await page.mouse.up();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/scatter-close-range.png` });
});
