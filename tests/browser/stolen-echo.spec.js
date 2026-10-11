import { test, expect } from "@playwright/test";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

const artifacts = ".mdxr/20261007195700-echo-loom/assets";
async function record(page, short = false) {
  const p = freshProfile();
  p.attempts = 2;
  p.run = createRun("STOLEN-INPUT");
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
  // Isolate the encounter. The recorded path comes entirely from native keys.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.enemies = [];
    g.hazards = [];
    g.apparatus = null;
    g.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 65 }];
    g.history = [];
    g.player.x = 160;
    g.player.y = 200;
    for (const row of g.tiles)
      for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
  });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(short ? 240 : 600);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(short ? 180 : 400);
  await page.keyboard.up("KeyW");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().history.length))
    .toBeGreaterThanOrEqual(24);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    const owner = g.spawn("weaver", 340, 70);
    owner.timer = 0;
    g.spawnQueue = [];
  });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__ECHO_LOOM__
          .game()
          .hazards.some((h) => h.kind === "stolenEcho"),
      ),
    )
    .toBe(true);
}

test("盗まれた昨日の予告と軌跡は停止中に進まず、後から離れて避けられる", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await record(page);
  await page.keyboard.press("Escape");
  const before = await page.evaluate(() => {
    const h = window.__ECHO_LOOM__
      .game()
      .hazards.find((h) => h.kind === "stolenEcho");
    return { age: h.age, x: h.x, y: h.y, frames: h.frames };
  });
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => {
      const h = window.__ECHO_LOOM__
        .game()
        .hazards.find((h) => h.kind === "stolenEcho");
      return { age: h.age, x: h.x, y: h.y, frames: h.frames };
    }),
  ).toEqual(before);
  expect(before.frames.length).toBeGreaterThanOrEqual(24);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/stolen-warning.png` });
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(350);
  await page.keyboard.up("KeyS");
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    () => {
      const h = window.__ECHO_LOOM__
        .game()
        .hazards.find((h) => h.kind === "stolenEcho");
      return h && h.age >= h.warning;
    },
    null,
    { timeout: 5000 },
  );
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/stolen-active.png` });
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyD");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__ECHO_LOOM__
          .game()
          .hazards.some((h) => h.kind === "stolenEcho"),
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.damageTaken),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.memoryCuts),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test("通常の残響と移動で逆走する影をほどき、奪い返した昨日を再開後も保持する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await record(page);
  const hp = await page.evaluate(
    () => window.__ECHO_LOOM__.game().enemies[0].hp,
  );
  await page.keyboard.press("KeyQ");
  await page.keyboard.down("KeyS");
  const captured = await page.waitForFunction(
    () => {
      const g = window.__ECHO_LOOM__.game();
      return g.run.memoryCuts === 1
        ? { run: structuredClone(g.run), owner: structuredClone(g.enemies[0]) }
        : false;
    },
    null,
    { timeout: 5000 },
  );
  const result = await captured.jsonValue();
  await page.keyboard.up("KeyS");
  expect(result.run.damageTaken).toBe(0);
  expect(result.owner.hp).toBe(hp - 16);
  expect(result.owner.state).toBe("recover");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/stolen-reclaimed.png` });
  // Complete this isolated fixture only to exercise the real save/reload UI.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    for (const e of [...g.enemies]) g.damageEnemy(e, e.hp, "shot");
  });
  await page.locator('[data-action="upgrade"]').first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.memoryCuts),
  ).toBe(1);
  expect(errors).toEqual([]);
});

test("解放で予告中の昨日を奪い返し、爆発範囲外の糸喰いへ反撃する", async ({
  page,
}, info) => {
  await record(page, true);
  const hp = await page.evaluate(
    () => window.__ECHO_LOOM__.game().enemies[0].hp,
  );
  await page.keyboard.press("KeyQ");
  await page.keyboard.press("KeyR");
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.memoryCuts),
    )
    .toBe(1);
  const result = await page.evaluate(() => ({
    run: window.__ECHO_LOOM__.snapshot().run,
    owner: window.__ECHO_LOOM__.game().enemies[0],
    echoes: window.__ECHO_LOOM__.game().echoes.length,
  }));
  expect(result.owner.hp).toBe(hp - 16);
  expect(result.run.damageTaken).toBe(0);
  expect(result.echoes).toBe(0);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/stolen-release.png` });
});
