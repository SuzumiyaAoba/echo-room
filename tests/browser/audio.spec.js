import { test, expect } from "@playwright/test";
import { freshProfile } from "../../src/save.js";
import { createRun } from "../../src/game.js";
import { renderAudio } from "../../scripts/audio-render.js";

test("地域の曲・ボス・停止を切り替え、消音と音声の後始末を確認", async ({
  page,
  browserName,
}) => {
  if (browserName === "chromium")
    await page.addInitScript(() => {
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = class extends NativeAudioContext {
        constructor(options) {
          super({ ...options, sinkId: { type: "none" } });
        }
      };
    });
  const profile = freshProfile();
  profile.attempts = 2;
  profile.run = createRun("SOUND-GARDEN");
  profile.run.stage = 15;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (raw) => localStorage.setItem("echo-loom.save.v1", raw),
    JSON.stringify(profile),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.audio().ctx?.state))
    .toBe("running");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.audio().scene.track))
    .toBe("garden");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.audio().scene.mood))
    .toBe("boss");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.audio().scene.mood))
    .toBe("pause");
  const step = await page.evaluate(() => window.__ECHO_LOOM__.audio().step);
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.audio().step))
    .toBeGreaterThan(step);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#music-volume").fill("0");
  await page.locator("#effects-volume").fill("0");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.audio().voices.size), {
      timeout: 6000,
    })
    .toBe(0);
  await page.locator("#music-volume").fill("0.35");
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.audio().voices.size))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.evaluate(() => {
    window.__previousMusic = [...window.__ECHO_LOOM__.audio().voices];
  });
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__ECHO_LOOM__.audio().scene.track))
    .toBe("harbor");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__previousMusic.filter((voice) =>
            window.__ECHO_LOOM__.audio().voices.has(voice),
          ).length,
      ),
    )
    .toBe(0);
  expect(errors).toEqual([]);
});

test("四つの曲を実際に合成し、異なる波形とステレオ出力を確認", async ({
  page,
}) => {
  await page.goto("/");
  const levels = [];
  for (const track of ["harbor", "garden", "furnace", "dawn"]) {
    const r = await renderAudio(page, {
      track,
      mood: track === "dawn" ? "rest" : "combat",
    });
    expect(r.invalid).toBe(0);
    expect(r.clipped).toBe(0);
    expect(r.peak).toBeGreaterThan(0.01);
    expect(r.peak).toBeLessThan(0.95);
    expect(r.stereoRms).toBeGreaterThan(0.0001);
    expect(r.voicesAfter).toBe(0);
    levels.push(r.rms);
  }
  expect(new Set(levels).size).toBe(4);
});

test("混雑した最大音量でも飽和せず、消音と音響なしでも遊べる", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const effects = [
    "shoot",
    "scatter",
    "prism",
    "threadguard",
    "counter",
    "stitch",
    "dash",
    "bell",
    "echo",
    "burst",
    "hurt",
    "kill",
    "enemyshoot",
    "warning",
    "impact",
    "charge",
    "coin",
    "heal",
    "clear",
    "upgrade",
    "bossdeath",
    "ui",
    "unweave",
    "shield",
    "spawn",
  ].map((id) => ({ id, at: 0.6 }));
  const busy = await renderAudio(page, {
    track: "furnace",
    mood: "boss",
    echoes: 2,
    seconds: 6,
    effects,
  });
  expect(busy.invalid).toBe(0);
  expect(busy.clipped).toBe(0);
  expect(busy.peak).toBeLessThan(0.95);
  expect(busy.voicesAfter).toBe(0);
  const guarded = await renderAudio(page, {
    track: "harbor",
    seconds: 1,
    effects: [{ id: "threadguard", at: 0.1 }],
    settings: { music: 0, effects: 0.7 },
  });
  expect(guarded.invalid).toBe(0);
  expect(guarded.clipped).toBe(0);
  expect(guarded.peak).toBeGreaterThan(0.001);
  expect(guarded.voicesAfter).toBe(0);
  const returned = await renderAudio(page, {
    track: "harbor",
    seconds: 1,
    effects: [{ id: "counter", at: 0.1 }],
    settings: { music: 0, effects: 0.7 },
  });
  expect(returned.invalid).toBe(0);
  expect(returned.clipped).toBe(0);
  expect(returned.peak).toBeGreaterThan(0.001);
  const stitched = await renderAudio(page, {
    track: "harbor",
    seconds: 1,
    effects: [{ id: "stitch", at: 0.1 }],
    settings: { music: 0, effects: 0.7 },
  });
  expect(stitched.invalid).toBe(0);
  expect(stitched.clipped).toBe(0);
  expect(stitched.peak).toBeGreaterThan(0.001);
  expect(stitched.peak).toBeLessThan(0.95);
  expect(stitched.voicesAfter).toBe(0);
  expect(returned.voicesAfter).toBe(0);
  const bell = await renderAudio(page, {
    track: "harbor",
    seconds: 1,
    effects: [{ id: "bell", at: 0.1 }],
    settings: { music: 0, effects: 0.7 },
  });
  expect(bell.invalid).toBe(0);
  expect(bell.clipped).toBe(0);
  expect(bell.peak).toBeGreaterThan(0.001);
  expect(bell.peak).toBeLessThan(0.95);
  expect(bell.voicesAfter).toBe(0);
  const muted = await renderAudio(page, {
    track: "furnace",
    mood: "boss",
    seconds: 1,
    effects,
    settings: { music: 0, effects: 0 },
  });
  expect(muted.peak).toBe(0);
  expect(muted.rms).toBe(0);
  expect(muted.scheduled).toBe(0);
  await page.evaluate(() => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  });
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.getByRole("button", { name: "最初のひと針へ" }).click();
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(650);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  await page.keyboard.press("KeyQ");
  await expect
    .poll(() =>
      page.evaluate(() => window.__ECHO_LOOM__.snapshot().run.echoesCast),
    )
    .toBe(1);
  expect(await page.evaluate(() => window.__ECHO_LOOM__.audio().ctx)).toBe(
    null,
  );
  expect(errors).toEqual([]);
});
