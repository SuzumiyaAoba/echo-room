import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY } from "../../src/save.js";

const assets = ".mdxr/20261007195700-echo-loom/assets";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function depart(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-flashes").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("VITALITY-FIRST");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page
    .getByRole("button", { name: "最初のひと針へ →", exact: true })
    .click();
}

async function snapshot(page) {
  return page.evaluate((key) => {
    const g = window.__ECHO_LOOM__.game();
    return {
      game: JSON.stringify(g),
      world: document.querySelector("#world").toDataURL("image/png"),
      body: document.body.innerText,
      profile: JSON.parse(localStorage.getItem(key)),
    };
  }, SAVE_KEY);
}

async function healthPixels(page, id) {
  return page.evaluate((id) => {
    const g = window.__ECHO_LOOM__.game();
    const e = g.enemies.find((e) => e.id === id);
    if (!e) return null;
    const canvas = document.querySelector("#world"),
      x = Math.max(2, Math.min(454, Math.round(e.x) - 12)),
      y = Math.max(2, Math.min(293, Math.round(e.y - e.r) - 18)),
      pixels = canvas.getContext("2d").getImageData(x * 2, y * 2, 48, 10).data;
    let health = 0,
      trail = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 229 && pixels[i + 1] === 206 && pixels[i + 2] === 154)
        health++;
      if (pixels[i] === 140 && pixels[i + 1] === 120 && pixels[i + 2] === 112)
        trail++;
    }
    const r = canvas.getBoundingClientRect(),
      scale = r.width / 480;
    return {
      kind: e.kind,
      hp: e.hp,
      maxHp: e.maxHp,
      time: g.t,
      health,
      trail,
      left: r.left + x * scale,
      right: r.left + (x + 24) * scale,
      top: r.top + y * scale,
      bottom: r.top + (y + 5) * scale,
      fillHeight: 3 * scale,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, id);
}

test("公開の一発射撃で削れた体力を読み、四画面・停止・収束・保存を保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await depart(page);
  const initial = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  await page.waitForFunction(() => window.__ECHO_LOOM__.game().enemies.length);
  await page.keyboard.press("KeyJ", { delay: 50 });
  await page.waitForFunction(() =>
    window.__ECHO_LOOM__.game().enemies.some((e) => e.hp > 0 && e.hp < e.maxHp),
  );
  await page.keyboard.press("Escape");
  const id = await page.evaluate(
    () =>
      window.__ECHO_LOOM__
        .game()
        .enemies.find((e) => e.hp > 0 && e.hp < e.maxHp).id,
  );
  const hit = await healthPixels(page, id);
  expect(hit.hp).toBe(18);
  expect(hit.maxHp).toBe(30);
  expect(hit.health).toBeGreaterThan(0);
  expect(hit.health).toBeLessThanOrEqual(168);
  expect(hit.trail).toBeGreaterThan(0);
  expect(hit.trail).toBeLessThanOrEqual(96);
  const before = await snapshot(page);
  expect(before.profile).toEqual(initial);
  await page.waitForTimeout(350);
  expect(await snapshot(page)).toEqual(before);
  await writeFile(
    `${assets}/vitality-after-${info.project.name}.png`,
    Buffer.from(before.world.split(",")[1], "base64"),
  );
  const displays = [];
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    const d = await healthPixels(page, id);
    expect(d.health).toBe(hit.health);
    expect(d.trail).toBe(hit.trail);
    expect(d.fillHeight).toBeGreaterThanOrEqual(2);
    expect(d.left).toBeGreaterThanOrEqual(0);
    expect(d.right).toBeLessThanOrEqual(size.width);
    expect(d.top).toBeGreaterThanOrEqual(0);
    expect(d.bottom).toBeLessThanOrEqual(size.height);
    displays.push(d);
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.waitForFunction(
    (time) => window.__ECHO_LOOM__.game().t >= time + 0.6,
    hit.time,
  );
  await page.keyboard.press("Escape");
  const settled = await healthPixels(page, id);
  expect(settled.hp).toBe(hit.hp);
  expect(settled.health).toBe(168);
  expect(settled.trail).toBe(0);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      SAVE_KEY,
    ),
  ).toEqual(initial);
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() =>
      window.__ECHO_LOOM__.game().enemies.some((e) => e.hp < e.maxHp),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/vitality-native-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Fresh public VITALITY-FIRST departure, native J fires one shot into a naturally spawned crawler. No Game, enemy, health, clock, position, history or profile writes. Four real CSS viewport sizes; pause checks full Game, canvas PNG, body and raw profile. Resume settles the lost-health trail; public home/reload/reentry retains the full entry checkpoint. Automated input, not an expedition or human playtest result.",
        hit,
        settled,
        displays,
        pauseMilliseconds: 350,
        pauseExact: true,
        saveExact: true,
        reloadHealthy: true,
        pausedCanvasSha256: sha(
          Buffer.from(before.world.split(",")[1], "base64"),
        ),
        initial,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("九種・通常と強敵・三地域・四残量の画素を旧描画と照合する", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { Game, createRun } = await import("/src/game.js");
    const { ENEMIES } = await import("/src/content.js");
    const { Renderer } = await import("/src/render.js");
    const { Renderer: Before } = await import(
      "/tests/fixtures/shell-aligned/vitality-render.js"
    );
    const make = (Type) => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 600;
      return new Type(canvas);
    };
    const old = make(Before),
      current = make(Renderer),
      rows = [];
    const sheet = document.createElement("canvas");
    sheet.width = 360;
    sheet.height = 150;
    const cc = sheet.getContext("2d");
    let sample = 0,
      pictures = 0;
    for (const stage of [0, 8, 16])
      for (const [kind, data] of Object.entries(ENEMIES))
        for (const elite of data.boss ? [false] : [false, true])
          for (const fraction of [1, 0.6, 0.2, 0.00001])
            for (const flashes of [false, true]) {
              const run = createRun("VITALITY-PIXELS");
              run.stage = stage;
              const g = new Game(run);
              g.enemies = [];
              g.spawnQueue = [{ time: Infinity }];
              g.t = 1.25;
              g.player.x = 350;
              g.player.y = 250;
              g.spawn(kind, 240, 150, elite);
              const e = g.enemies[0],
                settings = { shake: false, flashes };
              current.draw(g, 1.25, settings, {});
              if (fraction < 1)
                g.damageEnemy(e, e.maxHp * (1 - fraction), "shot");
              g.particles = [];
              g.labels = [];
              const samples = [];
              for (const age of fraction < 1 ? [0, 0.3, 0.6] : [0]) {
                g.t = 1.25 + age;
                const before = JSON.stringify(g);
                old.draw(g, g.t, settings, {});
                current.draw(g, g.t, settings, {});
                if (JSON.stringify(g) !== before)
                  throw new Error("Rendering changed Game");
                const a = new Uint32Array(
                    old.g.getImageData(0, 0, 480, 300).data.buffer,
                  ),
                  b = new Uint32Array(
                    current.g.getImageData(0, 0, 480, 300).data.buffer,
                  );
                let changed = 0,
                  outside = 0;
                const x = 228,
                  y = Math.round(e.y - e.r) - 18;
                for (let i = 0; i < a.length; i++)
                  if (a[i] !== b[i]) {
                    changed++;
                    const px = i % 480,
                      py = Math.floor(i / 480);
                    if (px < x || px >= x + 24 || py < y || py >= y + 5)
                      outside++;
                  }
                if (outside || ((data.boss || fraction === 1) && changed))
                  throw new Error("Pixels changed outside a wounded enemy bar");
                if (!data.boss && fraction < 1 && !changed)
                  throw new Error("Wounded enemy bar did not change");
                samples.push({ age, changed, outside });
                pictures++;
                if (
                  !data.boss &&
                  !elite &&
                  fraction === 0.6 &&
                  !flashes &&
                  age === 0
                ) {
                  cc.drawImage(
                    current.buffer,
                    210,
                    112,
                    60,
                    50,
                    (sample % 6) * 60,
                    Math.floor(sample / 6) * 50,
                    60,
                    50,
                  );
                  sample++;
                }
              }
              rows.push({ stage, kind, elite, fraction, flashes, samples });
            }
    return {
      scope:
        "Prepared rendering comparisons: genuine pre-health Renderer with only the accepted shield arc aligned and all other shared dependencies unchanged, actual Game.damageEnemy, remove both scenes' existing particles/labels before drawing. Compare every RGBA pixel; only the 24 by 5 wounded-enemy box may differ. Full-health enemies and all three bosses stay pixel-identical. Hold/settle ages are controlled timestamps, not native combat timing. The public input test separately covers real damage, real clock and pause.",
      configurations: rows.length,
      pictures,
      rows,
      sheet: sheet.toDataURL("image/png"),
      gameExact: true,
      outsideExact: true,
    };
  });
  expect(result.configurations).toBe(360);
  expect(result.pictures).toBe(900);
  await writeFile(
    `${assets}/vitality-sheet-${browserName}.png`,
    Buffer.from(result.sheet.split(",")[1], "base64"),
  );
  delete result.sheet;
  await writeFile(
    `${assets}/vitality-pixels-${browserName}.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
});
