import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { SAVE_KEY } from "../../src/save.js";

const assets = ".mdxr/20261007195700-echo-loom/assets";
const name = (browserName) =>
  browserName === "webkit" ? "webkit-spawn-warning" : browserName;
const proof = async (kind, engine, value) =>
  writeFile(
    `${assets}/rifts-${kind}-${name(engine)}.json`,
    JSON.stringify(value, null, 2) + "\n",
  );

async function modules(page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const [
      { Renderer },
      { Renderer: Before },
      { Game, createRun },
      { ENEMIES },
      { spawnWarning, spawnWarnings },
      { drawSpawnWarnings },
      { sprite },
    ] = await Promise.all([
      import("/src/render.js"),
      import(
        "/.mdxr/20261007195700-echo-loom/assets/rifts-predecessor-render.mjs"
      ),
      import("/src/game.js"),
      import("/src/content.js"),
      import("/src/spawn-warning.js"),
      import("/src/spawn-warning-render.js"),
      import("/src/art.js"),
    ]);
    window.__riftsModules = {
      Renderer,
      Before,
      Game,
      createRun,
      ENEMIES,
      spawnWarning,
      spawnWarnings,
      drawSpawnWarnings,
      sprite,
    };
  });
}

test("九種類の出現予告を三地域・強敵・時刻・明滅設定で照合し、予定と描画の外側を保つ", async ({
  page,
  browserName,
}) => {
  await modules(page);
  const result = await page.evaluate(() => {
    const { Renderer, Before, Game, createRun, ENEMIES, spawnWarning } =
      window.__riftsModules;
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      return c;
    };
    const current = new Renderer(canvas()),
      before = new Before(canvas()),
      saved = localStorage.getItem("echo-loom.save.v1"),
      rows = [];
    for (const stage of [0, 8, 16]) {
      const run = createRun("RIFT-PAIRS");
      run.stage = stage;
      const g = new Game(run);
      g.enemies = [];
      g.player.echoCharges = 0;
      g.spawnQueue = [];
      before.draw(g, 0, { shake: false, flashes: false });
      current.draw(g, 0, { shake: false, flashes: false });
      const quiet = before.g.getImageData(0, 0, 480, 300).data,
        quietCurrent = current.g.getImageData(0, 0, 480, 300).data;
      if (quiet.some((v, i) => v !== quietCurrent[i]))
        throw Error("No-arrival floor changed");
      for (const kind of Object.keys(ENEMIES))
        for (const elite of [false, true])
          for (const remaining of [0.849, 0.5, 0.15, 0.01])
            for (const flashes of [false, true]) {
              g.spawnQueue = [
                { kind, elite, x: 230.4, y: 160.6, time: remaining },
              ];
              g.roomTime = 0;
              const warning = spawnWarning(g.spawnQueue[0], 0),
                snapshot = JSON.stringify(g);
              before.draw(g, 0, { shake: false, flashes });
              current.draw(g, 0, { shake: false, flashes });
              const old = before.g.getImageData(0, 0, 480, 300).data,
                actual = current.g.getImageData(0, 0, 480, 300).data;
              let changed = 0,
                outside = 0;
              for (let i = 0; i < old.length; i += 4)
                if ([0, 1, 2, 3].some((j) => old[i + j] !== actual[i + j])) {
                  changed++;
                  const x = (i / 4) % 480,
                    y = Math.floor(i / 4 / 480),
                    b = warning.bounds;
                  if (x < b.left || x > b.right || y < b.top || y > b.bottom)
                    outside++;
                }
              if (!changed || outside)
                throw Error(
                  JSON.stringify({
                    stage,
                    kind,
                    elite,
                    remaining,
                    flashes,
                    changed,
                    outside,
                    bounds: warning.bounds,
                  }),
                );
              if (
                JSON.stringify(g) !== snapshot ||
                localStorage.getItem("echo-loom.save.v1") !== saved
              )
                throw Error("Drawing changed game/RNG/save");
              rows.push({
                stage,
                kind,
                elite,
                remaining,
                flashes,
                changed,
                outside,
                bounds: warning.bounds,
              });
            }
    }
    return { rows, noArrivalFloorsExact: 3, gameQueueRngSaveExact: true };
  });
  expect(result.rows).toHaveLength(432);
  await proof("pairs", browserName, {
    scope:
      "432 controlled paired drawings of the actual Game/Renderer and the immutable pre-rifts renderer. Scene preparation deliberately replaces one scheduled arrival and removes actors; not earned gameplay. No mutations during drawing; differences only inside the warning bounds.",
    ...result,
  });
});

test("影の姿と角・目盛りを四画面で読み、描画状態と敵・弾の重なり順を保つ", async ({
  page,
  browserName,
}) => {
  await modules(page);
  const result = await page.evaluate(() => {
    const {
      Renderer,
      Before,
      Game,
      createRun,
      ENEMIES,
      drawSpawnWarnings,
      sprite,
    } = window.__riftsModules;
    const sample = document.createElement("canvas");
    sample.id = "rifts-sample";
    sample.width = 960;
    sample.height = 600;
    Object.assign(sample.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "min(960px,100vw,160vh)",
      height: "auto",
      zIndex: "10000",
    });
    document.body.append(sample);
    const current = new Renderer(sample),
      oldCanvas = document.createElement("canvas");
    oldCanvas.width = 960;
    oldCanvas.height = 600;
    const before = new Before(oldCanvas),
      g = new Game(createRun("RIFT-GALLERY"));
    g.enemies = [];
    g.player.echoCharges = 0;
    g.player.x = 430;
    g.player.y = 270;
    const places = [
      [70, 75],
      [180, 75],
      [290, 75],
      [400, 75],
      [70, 160],
      [180, 160],
      [290, 160],
      [400, 160],
      [240, 235],
    ];
    g.spawnQueue = Object.keys(ENEMIES).map((kind, i) => ({
      kind,
      x: places[i][0],
      y: places[i][1],
      time: 0.25,
      elite: i === 2,
    }));
    before.draw(g, 0, { shake: false, flashes: false });
    current.draw(g, 0, { shake: false, flashes: false });
    window.__riftsGallery = { g, current, before };
    const state = document.createElement("canvas").getContext("2d");
    state.globalAlpha = 0.37;
    state.fillStyle = "#abcdef";
    state.strokeStyle = "#345678";
    state.lineWidth = 4;
    state.font = "13px serif";
    state.globalCompositeOperation = "screen";
    state.imageSmoothingEnabled = true;
    state.translate(2.25, 3.75);
    const read = () => ({
      alpha: state.globalAlpha,
      fill: state.fillStyle,
      stroke: state.strokeStyle,
      width: state.lineWidth,
      font: state.font,
      composite: state.globalCompositeOperation,
      smoothing: state.imageSmoothingEnabled,
      transform: [...state.getTransform().toFloat64Array()],
    });
    const beforeState = read();
    drawSpawnWarnings(state, g, { flashes: false });
    const afterState = read();
    if (JSON.stringify(beforeState) !== JSON.stringify(afterState))
      throw Error("Spawn warning leaked Canvas state");
    const overlap = new Game(createRun("RIFT-LAYERS"));
    overlap.player.echoCharges = 0;
    overlap.spawnQueue = [{ kind: "moth", x: 230, y: 161, time: 0.2 }];
    overlap.spawn("shooter", 230, 161);
    overlap.makeBullet({ x: 230, y: 148 }, 0, 0, 10, false, "#f8bc9d");
    before.draw(overlap, 0, { shake: false, flashes: false });
    current.draw(overlap, 0, { shake: false, flashes: false });
    const mask = document.createElement("canvas");
    mask.width = 480;
    mask.height = 300;
    sprite(mask.getContext("2d"), "shooter", 230, 161);
    const maskPixels = mask.getContext("2d").getImageData(0, 0, 480, 300).data,
      a = before.g.getImageData(0, 0, 480, 300).data,
      b = current.g.getImageData(0, 0, 480, 300).data;
    let actorPixels = 0;
    for (let i = 0; i < a.length; i += 4)
      if (maskPixels[i + 3] === 255) {
        actorPixels++;
        if ([0, 1, 2, 3].some((j) => a[i + j] !== b[i + j]))
          throw Error("Arrival covers an existing actor");
      }
    const bulletIndex = (148 * 480 + 230) * 4;
    if ([0, 1, 2, 3].some((j) => a[bulletIndex + j] !== b[bulletIndex + j]))
      throw Error("Arrival covers a hostile bullet");
    before.draw(g, 0, { shake: false, flashes: false });
    current.draw(g, 0, { shake: false, flashes: false });
    return { contextExact: true, actorPixels, bulletExact: true };
  });
  expect(result.contextExact).toBe(true);
  expect(result.actorPixels).toBeGreaterThan(0);
  await page.evaluate(() => {
    const { current, before } = window.__riftsGallery;
    current.ctx.drawImage(before.canvas, 0, 0);
  });
  await page
    .locator("#rifts-sample")
    .screenshot({ path: `${assets}/rifts-before-${name(browserName)}.png` });
  await page.evaluate(() => {
    const { g, current } = window.__riftsGallery;
    current.draw(g, 0, { shake: false, flashes: false });
  });
  await page
    .locator("#rifts-sample")
    .screenshot({ path: `${assets}/rifts-after-${name(browserName)}.png` });
  const displays = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    const rect = await page.locator("#rifts-sample").boundingBox();
    expect(rect.width).toBeLessThanOrEqual(viewport.width);
    expect(rect.height).toBeLessThanOrEqual(viewport.height);
    displays.push({ viewport, rect });
  }
  await proof("layers", browserName, {
    scope:
      "Controlled gallery of the nine scheduled silhouettes, same Game and pre-rifts floor. Canvas state and opaque actor/hostile-bullet pixels remain exact. Four display sizes resize the native canvas, not an earned gameplay claim.",
    ...result,
    displays,
  });
});

test("新しい航路の本物の予告を停止し、再開後の出現と保存・読み込みを保つ", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-flashes").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("RIFT-FIRST");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.evaluate(() => {
    const Game = window.__ECHO_LOOM__.game().constructor,
      original = Game.prototype.spawn;
    window.__riftsSpawns = [];
    Game.prototype.spawn = function (...args) {
      const enemy = original.apply(this, args);
      window.__riftsSpawns.push({
        kind: args[0],
        x: args[1],
        y: args[2],
        elite: !!args[3],
        r: enemy.r,
        roomTime: this.roomTime,
      });
      return enemy;
    };
  });
  await page
    .getByRole("button", { name: "最初のひと針へ →", exact: true })
    .click();
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().roomTime >= 0.45,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "潮を待つ", exact: true }).waitFor();
  // Paused notices keep their remaining lifetime; settle the entrance animation.
  await page.waitForFunction(() =>
    document
      .querySelector("#notifications")
      .getAnimations({ subtree: true })
      .every((animation) => animation.playState === "finished"),
  );
  await page.waitForTimeout(150);
  const view = await page.evaluate(async () => {
    const { spawnWarnings } = await import("/src/spawn-warning.js"),
      g = window.__ECHO_LOOM__.game();
    return {
      roomTime: g.roomTime,
      pending: spawnWarnings(g),
      queue: structuredClone(g.spawnQueue),
    };
  });
  expect(view.pending.length).toBeGreaterThan(0);
  const frozen = () =>
    page.evaluate(
      (key) => ({
        game: JSON.stringify(window.__ECHO_LOOM__.game()),
        pixels: document.querySelector("#world").toDataURL(),
        body: document.body.innerText,
        profile: localStorage.getItem(key),
      }),
      SAVE_KEY,
    );
  const before = await frozen();
  await page.waitForTimeout(350);
  expect(await frozen()).toEqual(before);
  await page.screenshot({
    path: `${assets}/rifts-native-${name(browserName)}.png`,
  });
  const promised = view.queue.find(
    (n) =>
      n.kind === view.pending[0].kind &&
      Math.round(n.x) === view.pending[0].x &&
      Math.round(n.y) === view.pending[0].y,
  );
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.waitForFunction(
    (n) =>
      window.__riftsSpawns.some(
        (e) =>
          e.kind === n.kind &&
          e.x === n.x &&
          e.y === n.y &&
          e.roomTime >= n.time,
      ),
    promised,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "潮を待つ", exact: true }).waitFor();
  const actual = await page.evaluate(() => window.__riftsSpawns);
  expect(
    actual.some(
      (n) =>
        n.kind === promised.kind &&
        n.x === promised.x &&
        n.y === promised.y &&
        n.elite === !!promised.elite &&
        n.roomTime >= promised.time,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "潮を待つ", exact: true }).waitFor();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      SAVE_KEY,
    ),
  ).toEqual(saved);
  expect(errors).toEqual([]);
  await proof("native", browserName, {
    scope:
      "Fresh public first expedition and normal keyboard input. Temporary spawn observer calls the original once and records arguments/result only; no actors, HP, queue, RNG, history, time or profile writes. Actual preview and 350 ms full Game/RGBA/body/save pause; observed real spawn agrees with the schedule, entry save/reload exact.",
    view,
    actual,
    pauseExact: true,
    pauseMilliseconds: 350,
    reloadExact: true,
    errors,
  });
});
