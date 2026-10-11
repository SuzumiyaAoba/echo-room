import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY, prepareImport } from "../../src/save.js";
const assets = ".mdxr/20261007195700-echo-loom/assets";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const frozen = (page) =>
  page.evaluate(
    (key) => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      world: document.querySelector("#world").toDataURL("image/png"),
      body: document.body.innerText,
      save: localStorage.getItem(key),
    }),
    SAVE_KEY,
  );
async function observe(page) {
  return page.evaluate(async () => {
    const g = window.__ECHO_LOOM__.game(),
      enemy = g.enemies.find((e) => e.kind === "shield" && e.hp > 0);
    const { shieldGuard } = await import("/src/shield-guard.js");
    const pixels = document
      .querySelector("#world")
      .getContext("2d")
      .getImageData(0, 0, 960, 600).data;
    let arcPixels = 0,
      capPixels = 0;
    for (
      let y = Math.max(0, Math.floor((enemy.y - enemy.r - 9) * 2));
      y < Math.min(600, Math.ceil((enemy.y + enemy.r + 9) * 2));
      y++
    )
      for (
        let x = Math.max(0, Math.floor((enemy.x - enemy.r - 9) * 2));
        x < Math.min(960, Math.ceil((enemy.x + enemy.r + 9) * 2));
        x++
      ) {
        const i = (y * 960 + x) * 4;
        if (pixels[i] === 162 && pixels[i + 1] === 207 && pixels[i + 2] === 204)
          arcPixels++;
        if (pixels[i] === 215 && pixels[i + 1] === 238 && pixels[i + 2] === 227)
          capPixels++;
      }
    return {
      enemy,
      guard: shieldGuard(enemy),
      expectedHalfAngle: Math.acos(0.3),
      player: g.player,
      time: g.t,
      health: g.run.hp,
      arcPixels,
      capPixels,
    };
  });
}

test("獲得した庭の公開再開で自然な護りを読み、停止・四画面・向き・実ファイルを保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const file = `${assets}/encounter-entry-journey-weaving-9.json`,
    bytes = await readFile(file),
    legacy = prepareImport(bytes.toString()).profile;
  expect(legacy.run.stage).toBe(9);
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles(file);
  await page.locator('[data-action="importrecord"]').click();
  expect(await saved(page)).toEqual(legacy);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-flashes").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  const initial = await saved(page);
  expect(initial.run.chargeVersion).toBeUndefined();
  await page.locator('[data-action="continue"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll(".toast").length === 0,
  );
  await page.waitForFunction(() =>
    window.__ECHO_LOOM__
      .game()
      .enemies.some((e) => e.kind === "shield" && e.hp > 0),
  );
  await page.keyboard.press("Escape");
  const before = await frozen(page),
    first = await observe(page);
  expect(first.guard.halfAngle).toBe(first.expectedHalfAngle);
  expect(first.guard.angle).toBe(first.enemy.angle);
  expect(first.arcPixels).toBeGreaterThan(0);
  expect(first.capPixels).toBeGreaterThan(0);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
  expect(await saved(page)).toEqual(initial);
  await writeFile(
    `${assets}/shell-after-${info.project.name}.png`,
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
    expect((await frozen(page)).world).toBe(before.world);
    const bounds = await page.locator("#world").evaluate((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(size.width);
    expect(bounds.bottom).toBeLessThanOrEqual(size.height);
    displays.push({ size, bounds });
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  const movement = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game(),
      p = g.player;
    const solid = (x, y) => {
      for (const ox of [-p.r, p.r])
        for (const oy of [-p.r, p.r]) {
          const col = Math.floor((x + ox - 16) / 16),
            row = Math.floor((y + oy - 16) / 16);
          if (g.tiles[row]?.[col] !== 0) return true;
        }
      return false;
    };
    const moves = [
      { key: "KeyD", dx: 1, dy: 0 },
      { key: "KeyA", dx: -1, dy: 0 },
      { key: "KeyW", dx: 0, dy: -1 },
      { key: "KeyS", dx: 0, dy: 1 },
    ];
    return {
      start: { x: p.x, y: p.y },
      move: moves.find((m) =>
        Array.from({ length: 24 }, (_, i) => i + 1).every(
          (d) => !solid(p.x + m.dx * d, p.y + m.dy * d),
        ),
      ),
    };
  });
  expect(movement.move).toBeTruthy();
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down(movement.move.key);
  await page.waitForFunction(({ start, move }) => {
    const p = window.__ECHO_LOOM__.game().player;
    return (p.x - start.x) * move.dx + (p.y - start.y) * move.dy >= 20;
  }, movement);
  await page.keyboard.up(movement.move.key);
  await page.keyboard.press("Escape");
  const second = await observe(page);
  expect(second.time).toBeGreaterThan(first.time);
  expect(second.guard.angle).toBe(second.enemy.angle);
  expect(second.guard.radius).toBe(second.enemy.r + 4);
  expect(second.arcPixels).toBeGreaterThan(0);
  expect(second.enemy.angle).not.toBe(first.enemy.angle);
  expect(await saved(page)).toEqual(initial);
  const stopped = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(stopped);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const download = await pending,
    exportFile = `${assets}/shell-export-${info.project.name}.json`;
  await download.saveAs(exportFile);
  const actual = await readFile(exportFile);
  expect(prepareImport(actual.toString()).profile).toEqual(initial);
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles(exportFile);
  await page.locator('[data-action="importrecord"]').click();
  expect(await saved(page)).toEqual(initial);
  await page.reload();
  expect(await saved(page)).toEqual(initial);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/shell-native-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Native public import/reentry of a genuine garden checkpoint earned in the preceding complete JOURNEY-ONE expedition. Naturally spawned shield, read-only geometry and exact actual palette pixels, complete 350ms Game/PNG/body/raw-save freezes, four CSS sizes, ordinary movement until actual 20-dot displacement and actual export/public home import/reload. No live Game/profile/actor/health/clock/RNG injection; this is not a fresh expedition or a human playtest.",
        sourceArtifact: "encounter-entry-journey-weaving-9.json",
        sourceSha256: sha(bytes),
        first,
        second,
        movement,
        displays,
        pauseMilliseconds: 350,
        fullFreezeExact: true,
        wholeProfileExact: true,
        exportImportReloadExact: true,
        exportSha256: sha(actual),
        sha256: {
          game: sha(before.game),
          world: sha(Buffer.from(before.world.split(",")[1], "base64")),
          body: sha(before.body),
          save: sha(before.save),
        },
        errors,
      },
      null,
      2,
    ),
  );
});

test("三地域・二サイズ・16方向・二状態・発光・二地点768場面は護りの外を保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [
      { Game, createRun },
      { Renderer },
      { Renderer: Before },
      { SAVE_KEY },
      { segmentDistance },
    ] = await Promise.all([
      import("/src/game.js"),
      import("/src/render.js"),
      import("/tests/fixtures/shell-before/render.js"),
      import("/src/save.js"),
      import("/src/math.js"),
    ]);
    const make = (Type) => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      return new Type(c);
    };
    const current = make(Renderer),
      old = make(Before),
      rows = [],
      store = localStorage.getItem(SAVE_KEY),
      sheet = document.createElement("canvas");
    sheet.width = 640;
    sheet.height = 480;
    const cc = sheet.getContext("2d");
    cc.imageSmoothingEnabled = false;
    let configurations = 0,
      movePixels;
    for (const [region, stage] of [0, 8, 16].entries())
      for (const elite of [false, true])
        for (let direction = 0; direction < 16; direction++)
          for (const flashes of [false, true])
            for (const location of [
              { x: 220.2, y: 150.6 },
              { x: 52, y: 60 },
            ])
              for (const state of ["move", "recover"]) {
                const run = createRun("SHELL-PIXELS");
                run.stage = stage;
                const g = new Game(run);
                g.enemies = [];
                g.spawnQueue = [];
                g.mode = "combat";
                g.t = 1.25;
                g.player.x = 350;
                g.player.y = 250;
                const e = g.spawn("shield", location.x, location.y, elite);
                e.angle = (direction * Math.PI) / 8;
                e.state = state;
                g.particles = [];
                g.labels = [];
                const game = JSON.stringify(g),
                  rng = g.rng.state,
                  settings = { shake: false, flashes };
                old.draw(g, 0.4, settings, {});
                current.draw(g, 0.4, settings, {});
                const before = new Uint32Array(
                    old.g.getImageData(0, 0, 480, 300).data.buffer,
                  ),
                  after = new Uint32Array(
                    current.g.getImageData(0, 0, 480, 300).data.buffer,
                  );
                const originalPoints = [-0.85, 0, 0.85].map((offset) => ({
                  x: e.x + Math.cos(e.angle + offset) * (e.r + 4),
                  y: e.y - 4 + Math.sin(e.angle + offset) * (e.r + 4),
                }));
                let changed = 0,
                  outside = 0,
                  oldStrokeOnly = 0;
                for (let i = 0; i < before.length; i++)
                  if (before[i] !== after[i]) {
                    changed++;
                    const point = { x: i % 480, y: Math.floor(i / 480) };
                    if (Math.hypot(point.x - e.x, point.y - e.y) > e.r + 9) {
                      const originalStroke =
                        Math.min(
                          segmentDistance(
                            point,
                            originalPoints[0],
                            originalPoints[1],
                          ),
                          segmentDistance(
                            point,
                            originalPoints[1],
                            originalPoints[2],
                          ),
                        ) <= 2;
                      if (originalStroke) oldStrokeOnly++;
                      else outside++;
                    }
                  }
                if (!changed || outside)
                  throw Error(
                    `Guard pixel bounds ${stage}/${elite}/${direction}/${flashes}/${location.x}/${state}: ${changed}/${outside}`,
                  );
                if (state === "move") movePixels = after.slice();
                else
                  for (let i = 0; i < after.length; i++)
                    if (after[i] !== movePixels[i])
                      throw Error(
                        "Recover falsely changes current active guard pixels",
                      );
                current.draw(g, 60, settings, {});
                const repeated = new Uint32Array(
                  current.g.getImageData(0, 0, 480, 300).data.buffer,
                );
                for (let i = 0; i < after.length; i++)
                  if (after[i] !== repeated[i])
                    throw Error("Static guard depends on wall clock");
                if (JSON.stringify(g) !== game || g.rng.state !== rng)
                  throw Error("Rendering changed game/RNG");
                if (
                  !flashes &&
                  location.x === 220.2 &&
                  state === "move" &&
                  direction % 2 === 0
                )
                  cc.drawImage(
                    current.buffer,
                    Math.round(e.x) - 20,
                    Math.round(e.y) - 22,
                    40,
                    40,
                    (direction / 2) * 80,
                    (region * 2 + Number(elite)) * 80,
                    80,
                    80,
                  );
                rows.push({
                  stage,
                  elite,
                  direction,
                  flashes,
                  location,
                  state,
                  changed,
                  outside,
                  oldStrokeOnly,
                  gameExact: true,
                  rngExact: true,
                  repeatPixelsExact: true,
                  recoverSameAsMove: true,
                });
                configurations++;
              }
    if (localStorage.getItem(SAVE_KEY) !== store)
      throw Error("Rendering changed saved profile");
    return {
      scope:
        "Prepared full-RGBA comparisons against the genuine pre-shell Renderer. Differences must lie inside the new guard's circle of radius r+9 or within distance 2 of the original two width-2 segments with their original -4 vertical offset and +/-0.85 angles. The original-stroke part was independently diagnosed in 64 cases; the new circle bound is retained. Actual Game/RNG/storage held exact; recover has exactly the same active guard as move. Not public played combat.",
      configurations,
      rows,
      storageExact: true,
      sheet: sheet.toDataURL("image/png"),
    };
  });
  expect(result.configurations).toBe(768);
  await writeFile(
    `${assets}/shell-sheet-${browserName}.png`,
    Buffer.from(result.sheet.split(",")[1], "base64"),
  );
  delete result.sheet;
  await writeFile(
    `${assets}/shell-pixels-${browserName}.json`,
    JSON.stringify(result, null, 2),
  );
});

test("整数の弧は内側を塗らず、端・向き・移動・回復・描画状態を保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { drawShieldGuard } = await import("/src/shield-guard-render.js");
    const make = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      return c.getContext("2d");
    };
    const state = (c) => ({
      alpha: c.globalAlpha,
      fill: c.fillStyle,
      composite: c.globalCompositeOperation,
      smoothing: c.imageSmoothingEnabled,
      transform: [
        c.getTransform().a,
        c.getTransform().b,
        c.getTransform().c,
        c.getTransform().d,
        c.getTransform().e,
        c.getTransform().f,
      ],
    });
    const rows = [];
    for (let direction = 0; direction < 16; direction++)
      for (const elite of [false, true]) {
        const e = {
            kind: "shield",
            hp: 70,
            r: elite ? 12 : 10,
            x: 32,
            y: 32,
            angle: (direction * Math.PI) / 8,
            state: "move",
          },
          c = make();
        c.globalAlpha = 0.37;
        c.fillStyle = "#cab104";
        c.imageSmoothingEnabled = false;
        const before = state(c),
          enemy = JSON.stringify(e);
        drawShieldGuard(c, e);
        if (
          JSON.stringify(state(c)) !== JSON.stringify(before) ||
          JSON.stringify(e) !== enemy
        )
          throw Error("Guard changed context/enemy");
        const pixels = c.getImageData(0, 0, 64, 64).data;
        let arc = 0,
          caps = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i + 3]) {
            if (pixels[i + 3] !== 255)
              throw Error("Fractional/transparent guard pixel");
            const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]].join(",");
            if (!["23,48,55", "162,207,204", "215,238,227"].includes(rgb))
              throw Error("Unexpected guard palette");
            if (rgb === "162,207,204") arc++;
            if (rgb === "215,238,227") caps++;
            const x = (i / 4) % 64,
              y = Math.floor(i / 4 / 64);
            if (Math.hypot(x - e.x, y - e.y) < e.r - 3)
              throw Error("Filled the open guard interior");
          }
        if (!arc || !caps) throw Error("Missing guard arc/caps");
        const recover = make();
        drawShieldGuard(recover, {
          ...e,
          state: "recover",
          age: 100,
          flash: 1,
        });
        const other = recover.getImageData(0, 0, 64, 64).data;
        for (let i = 0; i < pixels.length; i++)
          if (pixels[i] !== other[i]) throw Error("Recovery changes guard");
        const translated = make();
        e.x = 33;
        e.y = 34;
        const movedEnemy = JSON.stringify(e);
        drawShieldGuard(translated, e);
        if (JSON.stringify(e) !== movedEnemy)
          throw Error("Cached translation changed enemy");
        const moved = translated.getImageData(0, 0, 64, 64).data;
        for (let y = 0; y < 62; y++)
          for (let x = 0; x < 63; x++)
            for (let ch = 0; ch < 4; ch++)
              if (
                pixels[(y * 64 + x) * 4 + ch] !==
                moved[((y + 2) * 64 + x + 1) * 4 + ch]
              )
                throw Error("Cached guard does not follow integer movement");
        rows.push({
          direction,
          elite,
          arc,
          caps,
          integerOpaquePalette: true,
          interiorEmpty: true,
          recoverExact: true,
          translatedExact: true,
          sameEnemyIdentityTranslationExact: true,
          contextExact: true,
          enemyExact: true,
        });
      }
    for (const e of [
      { kind: "crawler", hp: 70, r: 10, x: 32, y: 32, angle: 0 },
      { kind: "shield", hp: 0, r: 10, x: 32, y: 32, angle: 0 },
      { kind: "shield", hp: 70, r: NaN, x: 32, y: 32, angle: 0 },
    ]) {
      const c = make();
      drawShieldGuard(c, e);
      if (c.getImageData(0, 0, 64, 64).data.some((v) => v))
        throw Error("Invalid guard drawn");
    }
    return {
      scope:
        "Prepared isolated canvas components, 16 directions by two sizes. Independent palette, interior, context restoration, integer translation and recover checks; not live native combat.",
      configurations: rows.length,
      rows,
      invalidBlank: 3,
    };
  });
  expect(result.configurations).toBe(32);
  await writeFile(
    `${assets}/shell-component-${browserName}.json`,
    JSON.stringify(result, null, 2),
  );
});
