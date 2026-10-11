import { artifacts as artifacts } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createRun } from "../../src/game.js";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

async function start(page, stage) {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.run = createRun("NEEDLE-STITCH-NATIVE");
  profile.run.stage = stage;
  profile.settings.flashes = false;
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: profile },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-autoAim").check();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.locator('[data-action="continue"]').click();
  await page.bringToFront();
}

test("実際の渡し守へ現在と残響の針を重ね、停止・部屋の再開・書き出しへ回数を残す", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page, 7);
  await page.waitForFunction(() => !!window.__ECHO_LOOM__.game().boss);
  await page.keyboard.down("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().boss.needleMarks?.length > 0,
  );
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().run.needleStitches >= 2,
  );
  await page.keyboard.up("KeyJ");
  await expect(
    page.locator(".toast").filter({ hasText: "合わせ縫い" }),
  ).toBeVisible();
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${artifacts}/needle-stitch-native.png` });
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const before = await page.evaluate(() =>
    JSON.stringify(window.__ECHO_LOOM__.game()),
  );
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => JSON.stringify(window.__ECHO_LOOM__.game())),
  ).toBe(before);
  await page
    .getByRole("button", { name: "織片を確かめる", exact: true })
    .click();
  await expect(page.locator(".overlay")).toContainText("合わせ縫い");
  await page.keyboard.press("Escape");
  await page.keyboard.down("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().mode === "reward",
    null,
    { timeout: 45000 },
  );
  await page.keyboard.up("KeyJ");
  await page.getByRole("button", { name: "織らずに進む", exact: true }).click();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const count = await page.evaluate(
    () => window.__ECHO_LOOM__.game().run.needleStitches,
  );
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().run.needleStitches),
  ).toBe(count);
  expect(
    await page.evaluate(() =>
      window.__ECHO_LOOM__.game().enemies.some((e) => e.needleMarks?.length),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.profile.run.needleStitches).toBe(count);
  expect(JSON.stringify(backup).includes("needleMarks")).toBe(false);
  expect(errors).toEqual([]);
  await writeFile(
    `${artifacts}/needle-stitch-input-${info.project.name}.json`,
    JSON.stringify({
      scope:
        "Synthetic unupgraded room-seven entry; actual seeded boss defeated with native J/Q, then public reward skip/pause/codex/home/reload/export. Count is saved at the completed-room checkpoint. No enemy, damage, HP, history or clock edits after starting. Automated evidence, not a human play evaluation.",
      count,
      pauseMilliseconds: 300,
      pauseUnchanged: true,
      reloadPreserved: true,
      exported: backup.profile.run.needleStitches,
      errors,
    }),
  );
});

test("現在の針の印は停止中に止まり、再開して寿命が来ると消える", async ({
  page,
}) => {
  await start(page, 7);
  await page.waitForFunction(() => !!window.__ECHO_LOOM__.game().boss);
  await page.keyboard.down("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().boss.needleMarks?.length > 0,
  );
  await page.keyboard.up("KeyJ");
  await page.waitForFunction(
    () =>
      !window.__ECHO_LOOM__.game().bullets.some((bullet) => bullet.friendly),
  );
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const before = await page.evaluate(async () => {
    const { needleMarks } = await import("/src/needle-stitch.js");
    const game = window.__ECHO_LOOM__.game();
    return {
      time: game.t,
      marks: needleMarks(game.boss, game.t),
      count: game.run.needleStitches,
    };
  });
  expect(before.marks.length).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(async () => {
      const { needleMarks } = await import("/src/needle-stitch.js");
      const game = window.__ECHO_LOOM__.game();
      return {
        time: game.t,
        marks: needleMarks(game.boss, game.t),
        count: game.run.needleStitches,
      };
    }),
  ).toEqual(before);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.waitForFunction(async () => {
    const { needleMarks } = await import("/src/needle-stitch.js");
    const game = window.__ECHO_LOOM__.game();
    return needleMarks(game.boss, game.t).length === 0;
  });
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().run.needleStitches),
  ).toBe(0);
});

test("針目と完成の印を三つの数・寿命の境界で描き、印の外の画素と戦闘・保存を保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ Game, createRun }, { Renderer }, { Renderer: BeforeRenderer }] =
      await Promise.all([
        import("/src/game.js"),
        import("/src/render.js"),
        import("/tests/fixtures/needle-stitch-world/render.js"),
      ]);
    const settings = { flashes: false, particles: true };
    const before = new BeforeRenderer(document.createElement("canvas"));
    const after = new Renderer(document.createElement("canvas"));
    const repeated = new Renderer(document.createElement("canvas"));
    const saved = JSON.stringify(localStorage);
    const rows = [],
      captures = {};
    const configurations = [];
    for (const kind of ["shooter", "ferryman"]) {
      for (const count of [1, 2, 3])
        for (const age of [0, 0.6, 1.199, 1.2])
          configurations.push({
            kind,
            count,
            age,
            echo: false,
            weapon: "needle",
          });
      for (const age of [0, 0.125, 0.249, 0.25])
        configurations.push({
          kind,
          count: 3,
          age,
          echo: true,
          weapon: "needle",
        });
      for (const weapon of ["needle", "scatter", "prism"])
        configurations.push({ kind, count: 0, age: 0, echo: false, weapon });
    }
    for (const configuration of configurations) {
      const { kind, count, age, echo, weapon } = configuration;
      const game = new Game(createRun("NEEDLE-PIXELS", weapon));
      game.spawnQueue = [];
      game.enemies = [];
      for (const row of game.tiles)
        for (let i = 0; i < row.length; i++) if (row[i] === 2) row[i] = 0;
      Object.assign(game.player, { x: 180, y: 160 });
      const enemy = game.spawn(kind, 220, 160);
      enemy.hp = enemy.maxHp = 1000;
      for (let i = 0; i < count; i++) {
        game.shoot(game.player, 0, false);
        game.updateBullets(0.2);
      }
      if (echo) {
        game.shoot(game.player, 0, true);
        game.updateBullets(0.2);
      }
      game.t = age;
      const serialized = JSON.stringify(game);
      before.draw(game, 0, settings);
      after.draw(game, 0, settings);
      repeated.draw(game, 30, settings);
      if (serialized !== JSON.stringify(game)) throw new Error("Game changed");
      const a = before.g.getImageData(0, 0, 480, 300).data;
      const b = after.g.getImageData(0, 0, 480, 300).data;
      const c = repeated.g.getImageData(0, 0, 480, 300).data;
      let changed = 0;
      const top = Math.round(enemy.y - enemy.r - 10);
      for (let pixel = 0; pixel < 480 * 300; pixel++) {
        const index = pixel * 4,
          x = pixel % 480,
          y = Math.floor(pixel / 480);
        for (let channel = 0; channel < 4; channel++)
          if (b[index + channel] !== c[index + channel])
            throw new Error("Unstable paused pixels");
        if (
          [0, 1, 2, 3].some(
            (channel) => a[index + channel] !== b[index + channel],
          )
        ) {
          changed++;
          if (
            x < enemy.x - 10 ||
            x > enemy.x + 11 ||
            y < top - 2 ||
            y > top + 12
          )
            throw new Error(`Changed outside mark footprint: ${x}/${y}`);
        }
      }
      const visible = count > 0 && (age < 1.2 || (echo && age < 0.25));
      if (changed > 0 !== visible) throw new Error("Wrong mark visibility");
      rows.push({
        ...configuration,
        changedPixels: changed,
        gameUnchanged: true,
        repeatedPixelsIdentical: true,
      });
      if (kind === "shooter" && count === 3 && age === 0)
        captures[echo ? "completed" : "marks"] = after.buffer
          .toDataURL("image/png")
          .split(",")[1];
    }
    if (JSON.stringify(localStorage) !== saved)
      throw new Error("Saved state changed");
    return { rows, captures, savedUnchanged: true };
  });
  expect(result.rows).toHaveLength(38);
  await writeFile(
    `${artifacts}/needle-stitch-pixels-${browserName}.json`,
    JSON.stringify({
      scope:
        "Controlled candidate scenes with actual shot hits and prescribed render clocks. The archived reference retains the already accepted player-foot marker and enemy-health band, while omitting the original needle mark/cue. Only the original mark footprint may differ, with the original visibility, repeat-pixel and Game/storage checks. Not a played journey.",
      rows: result.rows,
      savedUnchanged: result.savedUnchanged,
    }),
  );
  if (browserName === "chromium")
    for (const [name, data] of Object.entries(result.captures))
      await writeFile(
        `${artifacts}/needle-stitch-${name}.png`,
        Buffer.from(data, "base64"),
      );
});
