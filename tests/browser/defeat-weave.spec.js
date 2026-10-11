import { fixturePath } from "./artifacts.js";
import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { freshProfile, SAVE_KEY, prepareImport } from "../../src/save.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const frozen = (page) =>
  page.evaluate(() => ({
    game: JSON.stringify(window.__ECHO_LOOM__.game()),
    world: document.querySelector("#world").toDataURL(),
  }));

test("通常の最初の部屋で実際に敵を倒し、撃破の姿を停止して保存と再開を保つ", async ({
  page,
}, info) => {
  const profile = freshProfile();
  profile.attempts = 2;
  profile.settings.autoAim = true;
  profile.settings.flashes = false;
  await page.addInitScript(
    ({ key, profile }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(profile));
    },
    { key: SAVE_KEY, profile },
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator('[data-action="setup"]').click();
  await page.locator("#seed").fill("DEFEAT-WEAVE-NATIVE");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.keyboard.down("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 24,
  );
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().defeats.length > 0,
  );
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.keyboard.up("KeyJ");
  await page.waitForTimeout(50);
  const before = await frozen(page);
  const cue = await page.evaluate(() => {
    const game = window.__ECHO_LOOM__.game();
    return {
      defeats: structuredClone(game.defeats),
      kills: game.run.kills,
      enemies: game.enemies.length,
    };
  });
  expect(cue.defeats.length).toBeGreaterThan(0);
  expect(cue.defeats.every((d) => d.age < d.duration)).toBe(true);
  expect(cue.kills).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(await frozen(page)).toEqual(before);
  if (info.project.name === "chromium")
    await writeFile(
      `${assets}/defeat-weave-native-first.png`,
      Buffer.from(before.world.split(",")[1], "base64"),
    );
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down("KeyJ");
  const movement = [],
    held = new Set(["KeyJ"]);
  let cleared = false;
  for (let step = 0; step < 450; step++) {
    const mode = await page.evaluate(() => window.__ECHO_LOOM__.game().mode);
    if (mode === "reward") {
      cleared = true;
      break;
    }
    expect(mode).toBe("combat");
    const angle = step / 12;
    const wanted = ["KeyJ"];
    if (step < 15) wanted.push("KeyW");
    else {
      if (Math.cos(angle) > 0.25) wanted.push("KeyD");
      if (Math.cos(angle) < -0.25) wanted.push("KeyA");
      if (Math.sin(angle) > 0.25) wanted.push("KeyS");
      if (Math.sin(angle) < -0.25) wanted.push("KeyW");
    }
    for (const key of [...held])
      if (!wanted.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of wanted)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
    if (step % 10 === 5) await page.keyboard.press("KeyQ");
    if (step % 18 === 9) await page.keyboard.press("Space");
    if (step % 20 === 15) await page.keyboard.press("KeyR");
    if (step % 10 === 0) movement.push({ step, keys: wanted });
    await page.waitForTimeout(100);
  }
  for (const key of held) await page.keyboard.up(key);
  expect(cleared).toBe(true);
  await page.keyboard.up("KeyJ");
  expect(
    await page.evaluate(() => ({
      kills: window.__ECHO_LOOM__.game().run.kills,
      defeats: window.__ECHO_LOOM__.game().defeats,
    })),
  ).toEqual({ kills: 7, defeats: [] });
  await page.locator('[data-action="skipreward"]').click();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.locator('[data-action="savehome"]').click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  expect(saved.run.kills).toBe(7);
  expect(JSON.stringify(saved)).not.toContain('"defeats"');
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().defeats),
  ).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/defeat-weave-input-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Fresh profile and public seed only before departure, then native J/Q, actual seven-enemy room, pause/resume, direction keys/dash/release to finish, reward skip, home and reload. No enemy, health, position, clock or history edits after starting; automated input evidence.",
        cue,
        movement,
        pauseMilliseconds: 300,
        pauseUnchanged: true,
        pausedCanvasSha256: sha(
          Buffer.from(before.world.split(",")[1], "base64"),
        ),
        saved,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("九種・通常と強敵・三つの致命傷・四時刻・明滅設定の360場面と無敵の表示を保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (saveKey) => {
    const { Game, createRun } = await import("/src/game.js");
    const { ENEMIES } = await import("/src/content.js");
    const { Renderer } = await import("/src/render.js");
    const { Renderer: Before } = await import(
      "/tests/fixtures/defeat-world/render.js"
    );
    const make = (Type) => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 600;
      return new Type(canvas);
    };
    const old = make(Before),
      current = make(Renderer);
    const pixels = (renderer) => renderer.g.getImageData(0, 0, 480, 300).data;
    const scenes = [],
      invulnerability = [];
    const contact = document.createElement("canvas");
    contact.width = 108 * 3;
    contact.height = 64 * 3;
    const cc = contact.getContext("2d");
    const kinds = Object.keys(ENEMIES);
    for (const [index, kind] of kinds.entries())
      for (const elite of ENEMIES[kind].boss ? [false] : [false, true])
        for (const source of ["shot", "echo", "burst"])
          for (const fraction of [0, 0.25, 0.65, 0.98])
            for (const flashes of [false, true]) {
              const game = new Game(createRun("DEFEAT-PIXELS"));
              game.spawnQueue = [];
              game.t = 1.25;
              game.player.x = 350;
              game.player.y = 250;
              const enemy = game.spawn(kind, 240, 160, elite);
              const gallery =
                !elite && source === "shot" && fraction === 0.25 && !flashes;
              const cell = {
                x: (index % 3) * 108,
                y: Math.floor(index / 3) * 64,
              };
              if (gallery) {
                old.draw(game, 0, { flashes: false });
                cc.drawImage(
                  old.buffer,
                  214,
                  112,
                  52,
                  64,
                  cell.x,
                  cell.y,
                  52,
                  64,
                );
              }
              game.damageEnemy(enemy, enemy.hp, source);
              game.particles = [];
              game.labels = [];
              game.pickups = [];
              game.flash = 0;
              game.defeats[0].age = game.defeats[0].duration * fraction;
              const state = JSON.stringify(game),
                rng = game.rng.state;
              const saved = localStorage.getItem(saveKey);
              old.draw(game, 0, { flashes });
              current.draw(game, 0, { flashes });
              const a = pixels(old),
                b = pixels(current);
              let changed = 0,
                outside = 0;
              for (let i = 0; i < a.length; i += 4) {
                if (
                  a[i] === b[i] &&
                  a[i + 1] === b[i + 1] &&
                  a[i + 2] === b[i + 2] &&
                  a[i + 3] === b[i + 3]
                )
                  continue;
                changed++;
                const x = (i / 4) % 480,
                  y = Math.floor(i / 4 / 480);
                if (x < 200 || x > 280 || y < 88 || y > 170) outside++;
              }
              if (!changed || outside)
                throw new Error(
                  JSON.stringify({
                    kind,
                    elite,
                    source,
                    fraction,
                    flashes,
                    changed,
                    outside,
                  }),
                );
              const copied = new Uint8ClampedArray(b);
              current.draw(game, 37, { flashes });
              const repeated = pixels(current);
              if (copied.some((value, i) => value !== repeated[i]))
                throw new Error("Repeated pixels changed");
              if (
                JSON.stringify(game) !== state ||
                game.rng.state !== rng ||
                localStorage.getItem(saveKey) !== saved
              )
                throw new Error("Draw mutated state");
              if (gallery)
                cc.drawImage(
                  current.buffer,
                  214,
                  112,
                  52,
                  64,
                  cell.x + 56,
                  cell.y,
                  52,
                  64,
                );
              scenes.push({
                kind,
                elite,
                source,
                fraction,
                flashes,
                changed,
                outside,
                repeatedPixelsEqual: true,
                gameUnchanged: true,
              });
            }
    for (const tick of Array.from({ length: 8 }, (_, i) => i)) {
      const game = new Game(createRun("NO-BLINK"));
      game.spawnQueue = [];
      game.t = (tick + 0.5) / 18;
      game.player.invulnerable = 0;
      current.draw(game, 0, { flashes: false });
      const plain = new Uint8ClampedArray(pixels(current));
      game.player.invulnerable = 0.8;
      const state = JSON.stringify(game);
      current.draw(game, 0, { flashes: false });
      const stable = pixels(current);
      if (plain.some((value, i) => value !== stable[i]))
        throw new Error("Disabled flashes still change the invulnerable body");
      old.draw(game, 0, { flashes: false });
      const previous = pixels(old);
      let oldChanges = 0;
      for (let i = 0; i < plain.length; i++)
        if (plain[i] !== previous[i]) oldChanges++;
      if (tick % 2 && !oldChanges)
        throw new Error("Baseline did not reproduce the old blink");
      if (JSON.stringify(game) !== state)
        throw new Error("Invulnerability display mutated game");
      invulnerability.push({
        tick,
        currentChanges: 0,
        oldChanges,
        gameUnchanged: true,
      });
    }
    const enlarged = document.createElement("canvas");
    enlarged.width = contact.width * 4;
    enlarged.height = contact.height * 4;
    const ec = enlarged.getContext("2d");
    ec.imageSmoothingEnabled = false;
    ec.drawImage(contact, 0, 0, enlarged.width, enlarged.height);
    return { scenes, invulnerability, contact: enlarged.toDataURL() };
  }, SAVE_KEY);
  expect(result.scenes).toHaveLength(360);
  expect(result.invulnerability).toHaveLength(8);
  if (browserName === "chromium")
    await writeFile(
      `${assets}/defeat-weave-contact.png`,
      Buffer.from(result.contact.split(",")[1], "base64"),
    );
  await writeFile(
    `${assets}/defeat-weave-pixels-${browserName}.json`,
    JSON.stringify(
      {
        scope:
          "Controlled real damageEnemy kills, then isolate defeat pictures by removing existing particles/labels/pickups before drawing. Compare the original renderer with only the previously accepted player-presence marker added and unchanged world pixels; native input cases separately cover actual fights. Eight fixed times also reproduce the old no-flashes invulnerability blink and prove the stable body.",
        scenes: result.scenes,
        invulnerability: result.invulnerability,
      },
      null,
      2,
    ) + "\n",
  );
});

test("実際に獲得した最終部屋を通常キーで勝利し、ボスのほどける姿と停止・再起動を保つ", async ({
  page,
}, info) => {
  const record = await readFile(
    fixturePath("memory-ward-arrival-needle-stitch-weaving.json"),
  );
  const initial = prepareImport(record.toString()).profile;
  const errors = [],
    held = new Set(),
    inputs = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "earned-final-room.json",
    mimeType: "application/json",
    buffer: record,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-autoAim").check();
  await page.locator("#setting-flashes").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.locator('[data-action="continue"]').click();
  const keys = async (wanted) => {
    for (const key of [...held])
      if (!wanted.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of wanted)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
  };
  const started = Date.now();
  let actual = null;
  for (let step = 0; step < 560; step++) {
    const state = await page.evaluate(() => {
      const g = window.__ECHO_LOOM__.game();
      return {
        mode: g.mode,
        hp: g.run.hp,
        kills: g.run.kills,
        bossHp: g.boss?.hp,
        defeats: structuredClone(g.defeats),
      };
    });
    if (state.defeats.some((d) => d.boss)) {
      actual = state;
      break;
    }
    expect(state.mode).not.toBe("dead");
    const seconds = (Date.now() - started) / 1000,
      angle = seconds * 0.6;
    const wanted = ["KeyJ"];
    if (Math.cos(angle) > 0.25) wanted.push("KeyD");
    if (Math.cos(angle) < -0.25) wanted.push("KeyA");
    if (Math.sin(angle) > 0.25) wanted.push("KeyS");
    if (Math.sin(angle) < -0.25) wanted.push("KeyW");
    await keys(wanted);
    if (step % 8 === 4) await page.keyboard.press("KeyQ");
    if (step % 16 === 8) await page.keyboard.press("Space");
    if (step % 16 === 0) await page.keyboard.press("KeyR");
    if (step % 8 === 0) inputs.push({ step, seconds, keys: wanted, ...state });
    await page.waitForTimeout(100);
  }
  expect(actual).not.toBeNull();
  expect(actual.bossHp).toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "潮を待つ", exact: true }),
  ).toBeVisible();
  await keys([]);
  await page.waitForTimeout(50);
  const before = await frozen(page);
  const paused = await page.evaluate(() =>
    structuredClone(window.__ECHO_LOOM__.game().defeats),
  );
  expect(paused.some((d) => d.boss && d.age < 0.7)).toBe(true);
  await page.waitForTimeout(300);
  expect(await frozen(page)).toEqual(before);
  if (info.project.name === "chromium")
    await writeFile(
      `${assets}/defeat-weave-native-boss.png`,
      Buffer.from(before.world.split(",")[1], "base64"),
    );
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await expect(page.locator('[data-action="again"]')).toBeVisible();
  const completed = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
  expect(completed.victories).toBe(initial.victories + 1);
  expect(completed.run).toBeNull();
  expect(JSON.stringify(completed)).not.toContain('"defeats"');
  await page.reload();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      SAVE_KEY,
    ),
  ).toEqual(completed);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/defeat-weave-boss-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Unchanged entry earned by the earlier actual 24-room weaving expedition, imported through public settings. Change only public aim/flash preferences, then native direction/J/Q/R/Space, actual final boss defeat, paused world, victory and reload. No actor, HP, position, clock or history edits.",
        sourceSha256: sha(record),
        sourceArtifact: "memory-ward-arrival-needle-stitch-weaving.json",
        inputs,
        actual,
        paused,
        pauseMilliseconds: 300,
        pauseUnchanged: true,
        pausedCanvasSha256: sha(
          Buffer.from(before.world.split(",")[1], "base64"),
        ),
        completed,
        reloadPreserved: true,
        wallSeconds: (Date.now() - started) / 1000,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});
