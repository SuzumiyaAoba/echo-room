import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY, prepareImport } from "../../src/save.js";
import { rewardPlan as beforeReward } from "../fixtures/rewind-v2/rewards.js";

function checkpoint(reward = true) {
  const p = freshProfile();
  p.attempts = 2;
  Object.assign(p.settings, { shake: false, flashes: false, autoAim: true });
  p.run = createRun("FOLD-1");
  p.run.checkpoint = reward ? "reward" : "entry";
  if (!reward) p.run.upgrades.rewind = 1;
  return p;
}
async function begin(page, profile) {
  await page.addInitScript(
    ({ key, profile }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(profile));
    },
    { key: SAVE_KEY, profile },
  );
  await page.goto("/");
}
async function frozen(page) {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  return page.evaluate(async (key) => {
    const g = window.__ECHO_LOOM__.game(),
      c = document.querySelector("#world");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    const { echoRecording } = await import("/src/recording-preview.js");
    return {
      game: JSON.stringify(g),
      save: localStorage.getItem(key),
      pixels: [...new Uint8Array(hash)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      recording: echoRecording(g),
      hud: document.querySelector("#echo-next").textContent,
    };
  }, SAVE_KEY);
}
async function pause(page) {
  await page.locator('[data-action="pause"]').click();
  await page.waitForTimeout(100);
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
  return before;
}
async function observe(page) {
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game(),
      original = g.castEcho;
    g.castEcho = function (...args) {
      const recorded = structuredClone(this.history);
      const result = Reflect.apply(original, this, args);
      window.__rewindCall = {
        recorded,
        actual: structuredClone(this.echoes.at(-1)),
        historyUnchanged:
          JSON.stringify(recorded) === JSON.stringify(this.history),
      };
      return result;
    };
  });
}
function verify(call) {
  expect(call.historyUnchanged).toBe(true);
  expect(call.actual.playback).toBe("reverse");
  expect(call.actual.frames).toEqual(call.recorded.slice().reverse());
  expect({ x: call.actual.x, y: call.actual.y }).toEqual({
    x: call.recorded.at(-1).x,
    y: call.recorded.at(-1).y,
  });
}
async function exit(page) {
  const held = new Set();
  for (let attempt = 0; attempt < 180; attempt++) {
    const move = await page.evaluate(async () => {
      const g = window.__ECHO_LOOM__.game();
      const { steerToExit } = await import("/scripts/pilot-navigation.js");
      return {
        ...steerToExit(g),
        near: Math.hypot(g.player.x - 240, g.player.y - 43) < 27,
      };
    });
    const wanted = new Set(
      move.near
        ? []
        : [
            move.mx > 0 ? "KeyD" : move.mx < 0 ? "KeyA" : null,
            move.my > 0 ? "KeyS" : move.my < 0 ? "KeyW" : null,
          ].filter(Boolean),
    );
    for (const key of held) if (!wanted.has(key)) await page.keyboard.up(key);
    for (const key of wanted) if (!held.has(key)) await page.keyboard.down(key);
    held.clear();
    wanted.forEach((k) => held.add(k));
    if (move.near) {
      await page.keyboard.press("KeyE");
      return;
    }
    await page.waitForTimeout(100);
  }
  throw Error("Actual keys did not reach the cleared exit");
}
async function proof(name, engine, data) {
  await writeFile(
    `/tmp/echo-rewind-${name}-${engine}.json`,
    JSON.stringify(data, null, 2) + "\n",
  );
}

test("公開の織片選択・航路・録画・Q・停止・実ファイル・再開で逆再生を保つ", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await begin(page, checkpoint());
  await page.getByRole("button", { name: "航路を続ける" }).click();
  const card = page.locator('[data-action="upgrade"][data-id="rewind"]');
  await expect(card).toContainText("今から昔へ");
  await expect(card).toContainText("録画の始点");
  await page.screenshot({ path: `/tmp/echo-rewind-choice-${browserName}.png` });
  await card.click();
  await exit(page);
  await page.locator('[data-action="route"][data-id="loom"]').click();
  await observe(page);
  await page.keyboard.down("KeyJ");
  for (const key of ["KeyD", "KeyW", "KeyA"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(300);
    await page.keyboard.up(key);
  }
  await page.keyboard.up("KeyJ");
  const recorded = await pause(page);
  expect(recorded.hud).toMatch(/^逆再生 /);
  expect(recorded.recording.shots.length).toBeGreaterThan(0);
  const g = JSON.parse(recorded.game);
  expect(recorded.recording.origin).toEqual({
    x: g.history.at(-1).x,
    y: g.history.at(-1).y,
  });
  expect(recorded.recording.end).toEqual({
    x: g.history[0].x,
    y: g.history[0].y,
  });
  await page.screenshot({
    path: `/tmp/echo-rewind-recording-${browserName}.png`,
  });
  await page.getByRole("button", { name: "操作と残響の使い方" }).click();
  await expect(page.locator("#recording-help")).toContainText(
    "今の自分から昔の場所へ逆再生",
  );
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(() => Boolean(window.__rewindCall));
  const call = await page.evaluate(() => window.__rewindCall);
  verify(call);
  const called = await pause(page);
  const actual = JSON.parse(called.game).echoes[0];
  expect(actual.playback).toBe("reverse");
  expect({ x: actual.x, y: actual.y }).toEqual({
    x: actual.frames[actual.frame].x,
    y: actual.frames[actual.frame].y,
  });
  await page.screenshot({
    path: `/tmp/echo-rewind-arrival-${browserName}.png`,
  });
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const file = await pending,
    exported = prepareImport(await readFile(await file.path(), "utf8")).profile;
  expect(exported.run.catalogVersion).toBe(3);
  expect(exported.run.upgrades.rewind).toBe(1);
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const saved = await page.evaluate(
    (key) => localStorage.getItem(key),
    SAVE_KEY,
  );
  await page.reload();
  await page.evaluate(() => {
    function first() {
      const g = window.__ECHO_LOOM__.game();
      if (g)
        window.__rewindEntry = {
          run: structuredClone(g.run),
          history: structuredClone(g.history),
          echoes: g.echoes.length,
        };
      else requestAnimationFrame(first);
    }
    requestAnimationFrame(first);
  });
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await page.waitForFunction(() => Boolean(window.__rewindEntry));
  const entry = await page.evaluate(() => window.__rewindEntry);
  const reopened = await pause(page);
  expect(entry.run.catalogVersion).toBe(3);
  expect(entry.run.upgrades.rewind).toBe(1);
  expect(entry.history.length).toBeLessThan(24);
  expect(entry.echoes).toBe(0);
  expect(reopened.save).toBe(saved);
  expect(errors).toEqual([]);
  await proof("native", browserName, {
    scope:
      "Prepared cleared reward checkpoint only. Public offered fragment selection, actual native exit/route/movement/fire/Q/help/export/reload. Read-only cast observer invokes original once; first-RAF entry read. No actor/HP/history/RNG/clock changes after entry. Not an earned complete expedition.",
    recorded,
    call,
    called,
    exported,
    entry,
    reopened,
    errors,
  });
});

test("版2の実ファイルは元の三枚から選べ、書き出し・再読込・取り消しでも候補版を保つ", async ({
  page,
  browserName,
}) => {
  const current = checkpoint(false),
    legacy = checkpoint();
  legacy.run.catalogVersion = 2;
  const expected = beforeReward(legacy.run).offers.map((u) => u.id);
  await begin(page, current);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "catalog-v2.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  expect(
    await page
      .locator('[data-action="upgrade"]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.id)),
  ).toEqual(expected);
  await expect(
    page.locator('[data-action="upgrade"][data-id="rewind"]'),
  ).toHaveCount(0);
  await page.locator('[data-action="upgrade"]').first().click();
  await pause(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const file = await pending,
    exported = prepareImport(await readFile(await file.path(), "utf8")).profile;
  expect(exported.run.catalogVersion).toBe(2);
  expect(exported.run.upgrades.rewind).toBe(0);
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  expect(saved.run.catalogVersion).toBe(2);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("button", { name: "直前の取り込みを戻す" }).click();
  await page.getByRole("button", { name: "この記録へ戻す" }).click();
  const undone = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  expect(undone.run.catalogVersion).toBe(3);
  expect(undone.run.upgrades.rewind).toBe(1);
  await proof("legacy", browserName, {
    scope:
      "Prepared current v3 and old v2 checkpoints; public file import, original three-card offer, selection, download, reload and undo. No complete-expedition claim.",
    expected,
    exported,
    saved,
    undone,
  });
});

test("三つのタッチ画面で逆再生の録画とQ/Rを読み、停止と見える操作先を保つ", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 640, height: 360 },
  });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await begin(page, checkpoint(false));
    await page.getByRole("button", { name: "航路を続ける" }).click();
    await observe(page);
    await page.keyboard.down("KeyD");
    await page.keyboard.down("KeyJ");
    await page.waitForTimeout(600);
    await page.keyboard.up("KeyD");
    await page.keyboard.up("KeyJ");
    const recorded = await pause(page),
      sizes = [];
    expect(recorded.hud).toMatch(/^逆再生 /);
    for (const viewport of [
      { width: 640, height: 360 },
      { width: 390, height: 844 },
      { width: 360, height: 640 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(120);
      const before = await frozen(page);
      await page.waitForTimeout(350);
      expect(await frozen(page)).toEqual(before);
      const layout = await page.evaluate(() => {
        const canvas = document.querySelector("#world").getBoundingClientRect();
        const label = document.querySelector("#echo-next");
        return {
          ratio: canvas.width / canvas.height,
          fontSize: parseFloat(getComputedStyle(label).fontSize),
          noOverflow: document.documentElement.scrollWidth <= innerWidth,
          hud: label.textContent,
        };
      });
      expect(layout.ratio).toBeCloseTo(1.6, 5);
      expect(layout.fontSize).toBeGreaterThanOrEqual(10);
      expect(layout.noOverflow).toBe(true);
      sizes.push({ viewport, exact: true, ...layout });
      await page.screenshot({
        path: `/tmp/echo-rewind-touch-${browserName}-${viewport.width}x${viewport.height}.png`,
      });
    }
    await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
    for (const action of ["echo", "burst"]) {
      const target = await page
        .locator(`[data-touch-action="${action}"]`)
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
            hit: el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            ),
          };
        });
      expect(target.hit).toBe(true);
      await page.touchscreen.tap(target.x, target.y);
      if (action === "echo") {
        await page.waitForFunction(() => Boolean(window.__rewindCall));
        verify(await page.evaluate(() => window.__rewindCall));
      }
      await page.waitForTimeout(60);
    }
    const released = await pause(page);
    expect(JSON.parse(released.game).echoes.length).toBe(0);
    expect(errors).toEqual([]);
    await proof("touch", browserName, {
      scope:
        "Prepared v3 rewind entry checkpoint, native recording keys and actual touch Q/R centers in headless touch context, three exact 350ms pauses and layouts. No physical-device or earned-fragment claim.",
      recorded,
      sizes,
      released,
      errors,
    });
  } finally {
    await context.close();
  }
});

test("三地域・三武器の描画を旧版と照合し、逆再生の始点と留め目だけを変える", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ Game, createRun }, { Renderer }, { Renderer: Before }] =
      await Promise.all([
        import("/src/game.js"),
        import("/src/render.js"),
        import("/tests/fixtures/rewind-world/render.js"),
      ]);
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      return c;
    };
    const current = new Renderer(canvas()),
      before = new Before(canvas()),
      rows = [],
      sheets = [];
    for (const stage of [0, 8, 16]) {
      const sheet = document.createElement("canvas");
      sheet.width = 960;
      sheet.height = 328;
      const sc = sheet.getContext("2d");
      sc.fillStyle = "#101e25";
      sc.fillRect(0, 0, 960, 328);
      for (const weapon of ["needle", "scatter", "prism"])
        for (const reverse of [false, true]) {
          const run = createRun("REWIND-ART", weapon);
          run.stage = stage;
          run.catalogVersion = reverse ? 3 : 2;
          if (reverse) run.upgrades.rewind = 1;
          const g = new Game(run);
          g.spawnQueue = [{ time: Infinity }];
          for (let i = 0; i < 120; i++)
            g.update(1 / 60, {
              mx: i < 50 ? 1 : i > 80 ? -1 : 0,
              my: i >= 50 && i <= 80 ? -1 : 0,
              fire: true,
              angle: -0.7,
            });
          g.bullets = [];
          g.particles = [];
          g.labels = [];
          g.castEcho();
          for (let i = 0; i < 24; i++) g.update(1 / 60);
          g.player.echoCharges = 1;
          g.bullets = [];
          g.particles = [];
          g.labels = [];
          const state = JSON.stringify(g),
            rng = g.rng.state;
          const settings = { shake: false, flashes: false };
          current.draw(g, g.t, settings);
          before.draw(g, g.t, settings);
          const now = current.ctx.getImageData(0, 0, 960, 600).data,
            old = before.ctx.getImageData(0, 0, 960, 600).data;
          let changed = 0,
            outside = 0;
          const bounds = g.history.concat(g.echoes).reduce(
            (b, p) => ({
              minX: Math.min(b.minX, p.x),
              minY: Math.min(b.minY, p.y),
              maxX: Math.max(b.maxX, p.x),
              maxY: Math.max(b.maxY, p.y),
            }),
            {
              minX: Infinity,
              minY: Infinity,
              maxX: -Infinity,
              maxY: -Infinity,
            },
          );
          for (let i = 0; i < now.length; i += 4)
            if (now.slice(i, i + 4).some((v, j) => v !== old[i + j])) {
              changed++;
              const x = ((i / 4) % 960) / 2,
                y = Math.floor(i / 4 / 960) / 2;
              if (
                x < bounds.minX - 12 ||
                x > bounds.maxX + 12 ||
                y < bounds.minY - 12 ||
                y > bounds.maxY + 16
              )
                outside++;
            }
          if (JSON.stringify(g) !== state || g.rng.state !== rng)
            throw Error("Rendering mutated model");
          rows.push({
            stage,
            weapon,
            reverse,
            changed,
            outside,
            worldUnchanged: true,
            rngSame: true,
          });
          if (weapon === "needle") {
            sc.drawImage(current.canvas, reverse ? 480 : 0, 28, 480, 300);
            sc.fillStyle = "#ddc797";
            sc.font = "14px monospace";
            sc.fillText(
              reverse ? "折り返す昨日：今から昔へ" : "通常：昔から今へ",
              (reverse ? 480 : 0) + 16,
              19,
            );
          }
        }
      sheets.push(sheet.toDataURL("image/png"));
    }
    return {
      scope:
        "Controlled native model/renderer scenes. The archived v2 renderer retains its original recording modules and adds the already accepted player-foot marker; forward draws must match exactly and reverse changes stay inside the original recording/echo bounds. Game/RNG remain unchanged. Not public input or human play evidence.",
      rows,
      sheets,
    };
  });
  for (const row of result.rows) {
    expect(row.outside).toBe(0);
    if (row.reverse) expect(row.changed).toBeGreaterThan(0);
    else expect(row.changed).toBe(0);
  }
  for (const [index, png] of result.sheets.entries())
    await writeFile(
      `/tmp/echo-rewind-art-${browserName}-${index}.png`,
      Buffer.from(png.split(",")[1], "base64"),
    );
  delete result.sheets;
  await proof("art", browserName, result);
});
