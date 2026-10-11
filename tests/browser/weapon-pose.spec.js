import { fixturePath } from "./artifacts.js";
import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

async function collect(page) {
  await page.evaluate(async () => {
    const { weaponPose } = await import("/src/weapon-pose.js");
    const samples = [];
    window.__WEAPON_POSE_READ__ = { samples, running: true };
    const sample = () => {
      if (!window.__WEAPON_POSE_READ__.running || samples.length >= 180) return;
      const game = window.__ECHO_LOOM__.game();
      if (game)
        samples.push({
          time: game.t,
          fire: game.history.at(-1)?.fire,
          player: weaponPose(game, { ...game.player, type: "player" }),
          echoes: game.echoes.map((actor) => ({
            frame: actor.frame,
            fire: actor.frames[actor.frame]?.fire,
            pose: weaponPose(game, { ...actor, type: "echo" }),
          })),
        });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function frozen(page) {
  await page.waitForTimeout(50);
  return page.evaluate(() => ({
    game: JSON.stringify(window.__ECHO_LOOM__.game()),
    pixels: document.querySelector("#world").toDataURL(),
  }));
}

test("三つの射出器の実際の射撃と残響を姿勢へ反映し、停止中は画素と戦闘を保つ", async ({
  browser,
}, info) => {
  const results = [];
  for (const weapon of ["needle", "scatter", "prism"]) {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 850 },
    });
    const page = await context.newPage();
    try {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const profile = freshProfile();
      profile.attempts = 2;
      profile.unlocked.push("scatter", "prism");
      await page.addInitScript(
        ({ key, raw }) => localStorage.setItem(key, raw),
        {
          key: SAVE_KEY,
          raw: JSON.stringify(profile),
        },
      );
      await page.goto("/");
      await page.getByRole("button", { name: "設定", exact: true }).click();
      await page.locator("#setting-autoAim").check();
      await page
        .getByRole("button", { name: "設定を閉じる", exact: true })
        .click();
      await page.locator('[data-action="setup"]').click();
      await page.locator(`[data-action="weapon"][data-id="${weapon}"]`).click();
      await page.getByRole("button", { name: "この灯りで出発する" }).click();
      await collect(page);
      await page.keyboard.down("KeyJ");
      await page.waitForFunction(
        () => window.__ECHO_LOOM__.game().history.length >= 48,
      );
      await page.keyboard.press("KeyQ");
      await page.waitForFunction(() =>
        window.__WEAPON_POSE_READ__.samples.some((s) =>
          s.echoes.some((e) => e.pose.muzzle),
        ),
      );
      await page.getByRole("button", { name: "一時停止", exact: true }).click();
      await page.keyboard.up("KeyJ");
      const before = await frozen(page);
      await page.waitForTimeout(300);
      expect(await frozen(page)).toEqual(before);
      const samples = await page.evaluate(() => {
        window.__WEAPON_POSE_READ__.running = false;
        return window.__WEAPON_POSE_READ__.samples;
      });
      expect(samples.some((s) => s.player.muzzle)).toBe(true);
      expect(samples.some((s) => s.player.recoil > 0)).toBe(true);
      expect(samples.some((s) => s.echoes.some((e) => e.pose.recoil > 0))).toBe(
        true,
      );
      for (const sample of samples)
        if (sample.fire) expect(sample.player.age).toBe(0);
      if (info.project.name === "chromium") {
        await page.screenshot({
          path: `${assets}/weapon-pose-native-${weapon}.png`,
        });
        await writeFile(
          `${assets}/weapon-pose-world-${weapon}.png`,
          Buffer.from(before.pixels.split(",")[1], "base64"),
        );
      }
      expect(errors).toEqual([]);
      results.push({
        weapon,
        samples,
        pauseMilliseconds: 300,
        pauseUnchanged: true,
        errors,
      });
    } finally {
      await context.close();
    }
  }
  await writeFile(
    `${assets}/weapon-pose-input-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Pre-unlocked weapon fixture only, then public weapon selection, native J/Q and pause. Actual first-room enemies and controls; no actor, health, clock or history edits after starting. Automated input evidence, not a human play evaluation.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
});

test("三武器・八方向・現在と残響・四時刻・発光設定の384場面で射出器の外とゲームを保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { Game, createRun } = await import("/src/game.js");
    const { Renderer } = await import("/src/render.js");
    const { Renderer: Before } = await import(
      "/tests/fixtures/reference/weapon-pose-baseline-render.mjs"
    );
    const make = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 600;
      return canvas;
    };
    const before = new Before(make()),
      current = new Renderer(make()),
      rows = [];
    const sheet = document.createElement("canvas");
    sheet.width = 1024;
    sheet.height = 576;
    const sc = sheet.getContext("2d");
    sc.imageSmoothingEnabled = false;
    const saved = JSON.stringify(localStorage);
    for (const [column, weapon] of ["needle", "scatter", "prism"].entries())
      for (const role of ["player", "echo"])
        for (let direction = 0; direction < 8; direction++)
          for (const tick of [null, 0, 2, 10])
            for (const flashes of [false, true]) {
              const game = new Game(createRun("WEAPON-PIXELS", weapon));
              game.spawnQueue = [];
              game.enemies = [];
              game.particles = [];
              const angle = (direction * Math.PI) / 4;
              const frames = Array.from(
                { length: (tick ?? 0) + 1 },
                (_, i) => ({
                  x: 170,
                  y: 150,
                  angle,
                  fire: tick !== null && i === 0,
                  moving: false,
                  walk: 0,
                }),
              );
              Object.assign(game.player, { x: 170, y: 150, angle });
              if (role === "player") game.history = frames;
              else {
                game.echoes = [
                  {
                    ...game.player,
                    frames,
                    frame: tick ?? 0,
                    elapsed: ((tick ?? 0) + 1) / 60,
                  },
                ];
                Object.assign(game.player, { x: 90, y: 220 });
              }
              const state = JSON.stringify(game),
                rng = game.rng.state,
                settings = { flashes, particles: true, shake: false };
              before.draw(game, 0, settings);
              current.draw(game, 0, settings);
              const old = before.g.getImageData(0, 0, 480, 300).data;
              const actual = current.g.getImageData(0, 0, 480, 300).data;
              current.draw(game, 30, settings);
              const repeat = current.g.getImageData(0, 0, 480, 300).data;
              let changed = 0;
              const actors = [game.player, ...game.echoes];
              for (let i = 0; i < actual.length; i += 4) {
                for (let channel = 0; channel < 4; channel++)
                  if (actual[i + channel] !== repeat[i + channel])
                    throw new Error("Frozen render changed");
                if (
                  old[i] === actual[i] &&
                  old[i + 1] === actual[i + 1] &&
                  old[i + 2] === actual[i + 2] &&
                  old[i + 3] === actual[i + 3]
                )
                  continue;
                changed++;
                const x = (i / 4) % 480,
                  y = Math.floor(i / 4 / 480);
                if (
                  !actors.some(
                    (a) =>
                      x >= a.x - 30 &&
                      x <= a.x + 30 &&
                      y >= a.y - 32 &&
                      y <= a.y + 24,
                  )
                )
                  throw new Error(`Weapon changed another region at ${x},${y}`);
              }
              if (
                !changed ||
                state !== JSON.stringify(game) ||
                rng !== game.rng.state
              )
                throw new Error("Missing weapon change or mutated game");
              rows.push({
                weapon,
                role,
                direction,
                tick,
                flashes,
                changed,
                outside: 0,
                gameUnchanged: true,
                repeatedPixelsEqual: true,
              });
              const row = role === "echo" ? 2 : tick === null ? 0 : 1;
              if (
                direction === 0 &&
                ((role === "player" && tick === null && !flashes) ||
                  (tick === 0 && flashes))
              ) {
                sc.drawImage(
                  current.buffer,
                  146,
                  125,
                  64,
                  48,
                  (column + 1) * 256,
                  row * 192,
                  256,
                  192,
                );
                if (weapon === "needle")
                  sc.drawImage(
                    before.buffer,
                    146,
                    125,
                    64,
                    48,
                    0,
                    row * 192,
                    256,
                    192,
                  );
              }
            }
    if (JSON.stringify(localStorage) !== saved)
      throw new Error("Storage changed");
    return { rows, sheet: sheet.toDataURL() };
  });
  expect(result.rows).toHaveLength(384);
  await writeFile(
    `${assets}/weapon-pose-pixels-${browserName}.json`,
    JSON.stringify(result.rows, null, 2) + "\n",
  );
  if (browserName === "chromium")
    await writeFile(
      `${assets}/weapon-pose-contact.png`,
      Buffer.from(result.sheet.split(",")[1], "base64"),
    );
});

test("獲得した連射の記録を取り込み、発光なしで移動・回避・射撃と残響を止めて保つ", async ({
  page,
}, info) => {
  const record = await readFile(
    fixturePath("memory-ward-arrival-needle-stitch-shooting.json"),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "earned-shooting.json",
    mimeType: "application/json",
    buffer: record,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-flashes").uncheck();
  await page.locator("#setting-autoAim").check();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().run.upgrades.rapid),
  ).toBe(3);
  await collect(page);
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 36,
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__ECHO_LOOM__.game().player.dash > 0);
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(() =>
    window.__WEAPON_POSE_READ__.samples.some((s) =>
      s.echoes.some((e) => e.pose.recoil > 0),
    ),
  );
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const before = await frozen(page);
  await page.waitForTimeout(300);
  expect(await frozen(page)).toEqual(before);
  const samples = await page.evaluate(() => {
    window.__WEAPON_POSE_READ__.running = false;
    return window.__WEAPON_POSE_READ__.samples;
  });
  expect(samples.some((s) => s.player.recoil > 0)).toBe(true);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).settings.flashes,
      SAVE_KEY,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/weapon-pose-earned-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Unchanged entry file earned by the earlier actual 24-room shooting expedition, imported through public settings. Change only public flash/auto-aim preferences, then native D/J/Space/Q and pause; no actor, HP, clock or history edits.",
        sourceSha256: createHash("sha256").update(record).digest("hex"),
        rapid: 3,
        flashes: false,
        samples,
        pauseMilliseconds: 300,
        pauseUnchanged: true,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});
