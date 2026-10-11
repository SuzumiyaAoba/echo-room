import { artifacts as artifacts } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

async function enter(page, { shield = false, flashes = true, stage = 0 } = {}) {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.settings.flashes = flashes;
  profile.run = createRun("FEEDBACK-INPUT");
  profile.run.stage = stage;
  if (shield) profile.run.upgrades.shield = 1;
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: profile },
  );
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await page.bringToFront();
}

async function receiveBullet(page) {
  // Diagnostic placement only. The ordinary swept bullet collision and damage
  // code run on the real room clock; no direct hurt(), health or timer edits.
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.enemies = [];
    g.spawnQueue = [{ time: 1000, kind: "crawler", x: 240, y: 70 }];
    g.makeBullet(
      { x: g.player.x + 35, y: g.player.y },
      Math.PI,
      15,
      100,
      false,
      "#ef9c87",
    );
  });
  await page.waitForFunction(() => !!window.__ECHO_LOOM__.game().hitCue);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-action="resume"]').first()).toBeVisible();
  await page.waitForTimeout(120); // HUD samples at 10 Hz, from the game clock.
}

async function feedback(page) {
  return page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      cue: structuredClone(g.hitCue),
      hp: g.run.hp,
      damage: g.run.damageTaken,
      fill: document.querySelector("#health-fill").style.width,
      trail: document.querySelector("#health-trail").style.width,
      impact: document.querySelector(".health-hud").dataset.impact,
    };
  });
}

test("実際の敵弾の方向と失った体力を表示し、一時停止中は残像も止まる", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await receiveBullet(page);
  const frozen = await feedback(page);
  expect(frozen.hp).toBe(85);
  expect(frozen.damage).toBe(15);
  expect(frozen.cue.kind).toBe("hurt");
  expect(Math.abs(frozen.cue.angle)).toBeLessThan(0.01);
  expect(parseFloat(frozen.trail)).toBeGreaterThan(parseFloat(frozen.fill));
  await page.waitForTimeout(300);
  expect(await feedback(page)).toEqual(frozen);
  await page.locator('[data-action="resume"]').first().click();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/feedback-hurt.png` });
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().hitCue))
    .toBeNull();
  await expect
    .poll(() => feedback(page))
    .toMatchObject({ hp: 85, fill: "85%", trail: "85%", impact: "" });
  await page.keyboard.press("Escape");
  await page.locator('[data-action="savehome"]').click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().hitCue),
  ).toBeNull();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key).includes("hitCue"),
      SAVE_KEY,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("明滅を切っても貝殻の防御と被弾を区別し、実際の体力を即時表示する", async ({
  page,
}, info) => {
  await enter(page, { shield: true, flashes: false });
  await receiveBullet(page);
  expect(await feedback(page)).toMatchObject({
    hp: 100,
    damage: 0,
    impact: "shield",
    fill: "100%",
    trail: "100%",
    cue: { kind: "shield" },
  });
  await page.locator('[data-action="resume"]').first().click();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/feedback-shield.png` });
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.game().hitCue))
    .toBeNull();
  await receiveBullet(page);
  expect(await feedback(page)).toMatchObject({
    hp: 85,
    damage: 15,
    impact: "hurt",
    fill: "85%",
    cue: { kind: "hurt" },
  });
  await page.locator('[data-action="resume"]').first().click();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/feedback-reduced.png` });
});

test("ボスの予兆の残り時間と楽章を表示し、横長の小画面でも停止と再開に追従する", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await enter(page, { stage: 7 });
  await expect(page.locator("#boss-phase")).toHaveText("第一楽章");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().boss?.state === "windup",
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  const frozen = await page.evaluate(() => ({
    timer: window.__ECHO_LOOM__.game().boss.timer,
    text: document.querySelector("#boss-countdown").textContent,
    progress: document.querySelector("#boss-clock-fill").style.width,
    aria: document
      .querySelector("#boss-telegraph")
      .getAttribute("aria-valuenow"),
  }));
  expect(frozen.text).toMatch(/^発動まで \d\.\d秒$/);
  expect(parseInt(frozen.aria)).toBeGreaterThanOrEqual(0);
  expect(parseInt(frozen.aria)).toBeLessThanOrEqual(100);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().boss.timer),
  ).toBe(frozen.timer);
  expect(await page.locator("#boss-countdown").textContent()).toBe(frozen.text);
  await page.locator('[data-action="resume"]').first().click();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/feedback-boss-small.png` });
  for (const width of [844, 640]) {
    await page.setViewportSize({ width, height: 390 });
    const rect = await page.locator("#bossbar").boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y + rect.height).toBeLessThan(190);
    expect(
      await page
        .locator("#bossbar")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  await expect(page.locator("#boss-telegraph")).toBeHidden();
});
