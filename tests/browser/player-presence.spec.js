import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const assets = ".mdxr/20261007195700-echo-loom/assets";

test("実際の終盤入口と通常のQで重なった残響からミナの足元を見分け、停止中は状態・画素・保存を保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "earned-entry.json",
    mimeType: "application/json",
    buffer: await readFile(`${assets}/memory-ward-arrival-bell-weaving.json`),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.locator('[data-action="continue"]').click();
  await page.keyboard.down("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 48,
  );
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 1,
  );
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 2,
  );
  await page.waitForTimeout(650);
  await page.keyboard.press("Escape");
  await page.keyboard.up("KeyJ");
  await page.waitForTimeout(150);
  const capture = () =>
    page.evaluate(() => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      save: JSON.stringify(localStorage),
      pixels: document.querySelector("#world").toDataURL(),
    }));
  const before = await capture();
  await page.waitForTimeout(350);
  expect(await capture()).toEqual(before);
  const result = await page.evaluate(async () => {
    const game = window.__ECHO_LOOM__.game();
    const { Renderer } = await import("/src/render.js");
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 600;
    const renderer = new Renderer(canvas);
    const state = JSON.stringify(game);
    renderer.draw(game, game.t, { shake: false, flashes: false });
    const x = Math.round(game.player.x),
      y = Math.round(game.player.y);
    return {
      stage: game.run.stage,
      echoes: game.echoes.length,
      overlapping: game.echoes.every(
        (e) => e.x === game.player.x && e.y === game.player.y,
      ),
      marker: [...renderer.g.getImageData(x, y + 6, 1, 1).data],
      unchanged: JSON.stringify(game) === state,
      png: canvas.toDataURL(),
    };
  });
  expect(result.stage).toBe(23);
  expect(result.echoes).toBe(2);
  expect(result.overlapping).toBe(true);
  expect(result.marker).toEqual([241, 208, 161, 255]);
  expect(result.unchanged).toBe(true);
  expect(errors).toEqual([]);
  const engine = info.project.name.replace("webkit-player-presence", "webkit");
  await writeFile(
    `${assets}/presence-natural-${engine}.png`,
    Buffer.from(result.png.split(",")[1], "base64"),
  );
  delete result.png;
  await writeFile(
    `${assets}/presence-natural-${engine}.json`,
    JSON.stringify(
      { ...result, pauseMilliseconds: 350, pauseExact: true, errors },
      null,
      2,
    ),
  );
});

test("三武器・四つの部屋の足元以外の画素を元の描画と同じに保ち、敵弾を目印の手前へ描く", async ({
  page,
}, info) => {
  await page.route("**/src/main.js*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { Renderer } = await import("/src/render.js");
    const { Renderer: Before } = await import(
      "/tests/fixtures/player-presence-before/render.js"
    );
    const { Game, createRun } = await import("/src/game.js");
    const create = (Type) => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 600;
      return new Type(canvas);
    };
    const results = [];
    const save = JSON.stringify(localStorage);
    for (const weapon of ["needle", "scatter", "prism"])
      for (const stage of [0, 8, 16, 23])
        for (const flashes of [false, true]) {
          const run = createRun("PRESENCE-PIXELS", weapon);
          run.stage = stage;
          run.upgrades = {
            double: 2,
            thread: 3,
            triangle: 1,
            counter: 1,
            wide: 1,
          };
          const game = new Game(run);
          game.t = 2.37;
          game.player.invulnerable = 0.5;
          game.player.x = 240.35;
          game.player.y = 235.2;
          game.history = Array.from({ length: 60 }, () => ({
            x: 240.35,
            y: 235.2,
            angle: -Math.PI / 2,
            fire: false,
          }));
          game.castEcho();
          game.castEcho();
          game.particles = [];
          const old = create(Before),
            current = create(Renderer);
          const x = Math.round(game.player.x),
            y = Math.round(game.player.y);
          for (const bullets of [false, true]) {
            game.bullets = [];
            if (bullets) {
              const b = game.makeBullet(
                { x, y: y + 6 },
                0,
                10,
                0,
                false,
                "#eca886",
              );
              b.x = x;
              b.y = y + 6;
            }
            const state = JSON.stringify(game);
            old.draw(game, game.t, { shake: false, flashes });
            current.draw(game, game.t, { shake: false, flashes });
            const a = old.g.getImageData(0, 0, 480, 300).data;
            const b = current.g.getImageData(0, 0, 480, 300).data;
            let outside = 0,
              changed = 0;
            for (let i = 0; i < a.length; i++)
              if (a[i] !== b[i]) {
                changed++;
                const px = (i >> 2) % 480,
                  py = Math.floor((i >> 2) / 480);
                if (px < x - 6 || px > x + 6 || py < y + 4 || py > y + 11)
                  outside++;
              }
            results.push({
              weapon,
              stage,
              flashes,
              bullets,
              changed,
              outside,
              foreground: [...current.g.getImageData(x, y + 6, 1, 1).data],
              unchanged: JSON.stringify(game) === state,
              saveExact: JSON.stringify(localStorage) === save,
            });
          }
        }
    return results;
  });
  expect(results).toHaveLength(48);
  for (const r of results) {
    expect(r.outside, JSON.stringify(r)).toBe(0);
    expect(r.changed).toBeGreaterThan(0);
    expect(r.unchanged).toBe(true);
    expect(r.saveExact).toBe(true);
    expect(r.foreground).toEqual(
      r.bullets ? [255, 228, 189, 255] : [241, 208, 161, 255],
    );
  }
  const engine = info.project.name.replace("webkit-player-presence", "webkit");
  await writeFile(
    `${assets}/presence-pixels-${engine}.json`,
    JSON.stringify(results, null, 2),
  );
});
