import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { freshProfile, SAVE_KEY } from "../../src/save.js";
import { createRun } from "../../src/game.js";

const assets = ".mdxr/20261007195700-echo-loom/assets";

async function enter(page, stage) {
  const profile = freshProfile();
  profile.settings.flashes = false;
  profile.run = createRun("NATIVE-BOSS-WARNING");
  profile.run.stage = stage;
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: SAVE_KEY,
    raw: JSON.stringify(profile),
  });
  await page.goto("/");
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("#bossbar")).toBeVisible();
}

test("三ボスの予告を三つの時刻と二つの楽章で描き、変更を警告の範囲に収めて戦闘・保存・乱数を保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { Game, createRun } = await import("/src/game.js");
    const { Renderer } = await import("/src/render.js");
    const { Renderer: Before } = await import(
      "/.mdxr/20261007195700-echo-loom/assets/rifts-boss-baseline-render.mjs"
    );
    const { chargePath } = await import("/src/boss-warning.js");
    const { segmentDistance } = await import("/src/math.js");
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      return c;
    };
    const old = new Before(canvas()),
      current = new Renderer(canvas()),
      rows = [],
      captures = [];
    const saved = JSON.stringify(localStorage);
    const scenarios = [];
    for (const [stage, kind] of [
      [7, "ferryman"],
      [15, "gardener"],
      [23, "heart"],
    ])
      for (const phase of [0, 1])
        for (const attack of [0, 1, 2])
          for (const progress of [0, 0.5, 0.95])
            scenarios.push({ stage, kind, phase, attack, progress });
    scenarios.push(
      {
        stage: 15,
        kind: "gardener",
        phase: 0,
        attack: 0,
        progress: 0.5,
        weave: 0.25,
      },
      {
        stage: 15,
        kind: "gardener",
        phase: 1,
        attack: 0,
        progress: 1,
        active: true,
      },
    );
    for (const position of [
      { x: 400, y: 230 },
      { x: 80, y: 80 },
      { x: 240, y: 230 },
      { x: 400, y: 140 },
    ])
      scenarios.push({
        stage: 7,
        kind: "ferryman",
        phase: 0,
        attack: 2,
        progress: 0.95,
        position,
      });
    for (const scene of scenarios) {
      const run = createRun("WARNING-PIXELS");
      run.stage = scene.stage;
      const game = new Game(run);
      game.spawnQueue = [];
      if (scene.position)
        Object.assign(game.player, {
          x: scene.position.x < 100 ? 35 : 470,
          y: scene.position.y === 140 ? 140 : 280,
        });
      const boss = game.spawn(
        scene.kind,
        scene.position?.x || 240,
        scene.position?.y || 100,
      );
      boss.attack = scene.attack;
      boss.timer = 0;
      if (scene.phase) boss.hp = boss.maxHp * 0.4;
      game.updateEnemy(boss, 1 / 60);
      game.shake = 0;
      boss.timer = boss.plan.windup * (1 - scene.progress);
      for (const h of game.hazards) {
        h.age =
          (h.duration - 0.35) * scene.progress + (scene.active ? 0.01 : 0);
        h.charge = scene.weave || 0;
      }
      if (scene.active) boss.state = "recover";
      const path = chargePath(game, boss),
        state = JSON.stringify(game),
        rng = game.rng.state;
      old.draw(game, 0, { flashes: false });
      current.draw(game, 0, { flashes: false });
      const before = old.g.getImageData(0, 0, 480, 300).data,
        after = current.g.getImageData(0, 0, 480, 300).data;
      const permitted = (x, y) => {
        for (const h of game.hazards) {
          if (
            h.kind === "bloom" &&
            Math.abs(x - h.x) <= h.r + 11 &&
            Math.abs(y - h.y) <= h.r + 11
          )
            return true;
          if (
            h.kind === "line" &&
            (h.axis === "v"
              ? Math.abs(x - h.x) <= h.r + 3 && y >= 31 && y <= 273
              : Math.abs(y - h.y) <= h.r + 3 && x >= 31 && x <= 449)
          )
            return true;
        }
        if (boss.state !== "windup") return false;
        if (path) {
          if (path.some((p) => Math.hypot(x - p.x, y - p.y) <= boss.r + 3))
            return true;
          return (
            segmentDistance({ x, y }, boss, {
              x: boss.x + Math.cos(boss.angle) * 110,
              y: boss.y + Math.sin(boss.angle) * 110,
            }) <= 6
          );
        }
        return (
          boss.plan.angles.length > 0 &&
          Math.hypot(x - boss.x, y - boss.y) <= 72
        );
      };
      let changed = 0,
        outside = 0;
      for (let i = 0; i < after.length; i += 4)
        if (
          after[i] !== before[i] ||
          after[i + 1] !== before[i + 1] ||
          after[i + 2] !== before[i + 2] ||
          after[i + 3] !== before[i + 3]
        ) {
          changed++;
          if (!permitted((i / 4) % 480, Math.floor(i / 4 / 480))) outside++;
        }
      current.draw(game, 30, { flashes: false });
      const repeated = current.g.getImageData(0, 0, 480, 300).data;
      const stable = after.every((v, i) => v === repeated[i]);
      rows.push({
        ...scene,
        changed,
        outside,
        stable,
        stateUnchanged: JSON.stringify(game) === state,
        rngUnchanged: game.rng.state === rng,
      });
      if (
        scene.phase === 0 &&
        scene.progress === 0.95 &&
        !scene.position &&
        ((scene.kind === "ferryman" && scene.attack === 2) ||
          (scene.kind === "gardener" && scene.attack === 0))
      )
        captures.push({
          name: scene.kind,
          before: old.canvas.toDataURL(),
          after: current.canvas.toDataURL(),
        });
      if (
        scene.kind === "heart" &&
        scene.phase === 1 &&
        scene.attack === 2 &&
        scene.progress === 0.95
      )
        captures.push({
          name: "heart",
          before: old.canvas.toDataURL(),
          after: current.canvas.toDataURL(),
        });
    }
    return {
      rows,
      captures,
      savedUnchanged: JSON.stringify(localStorage) === saved,
    };
  });
  await writeFile(
    `${assets}/boss-warning-pixels-${browserName}.json`,
    JSON.stringify(
      {
        scope:
          "Native fixed scenes; fixture HP, phases and clocks are explicitly set before rendering. Compare old/new/repeated pixels, bounded changed warnings, and unchanged game/RNG/saved profile. This does not represent a played expedition.",
        rows: result.rows,
        savedUnchanged: result.savedUnchanged,
      },
      null,
      2,
    ) + "\n",
  );
  if (browserName === "chromium")
    for (const capture of result.captures)
      for (const side of ["before", "after"])
        await writeFile(
          `${assets}/boss-warning-${capture.name}-${side}.png`,
          Buffer.from(capture[side].split(",")[1], "base64"),
        );
  expect(result.rows).toHaveLength(60);
  expect(result.savedUnchanged).toBe(true);
  for (const row of result.rows) {
    expect(row.outside, JSON.stringify(row)).toBe(0);
    expect(row.stable, JSON.stringify(row)).toBe(true);
    expect(row.stateUnchanged).toBe(true);
    expect(row.rngUnchanged).toBe(true);
  }
  expect(result.rows.some((r) => r.changed > 0)).toBe(true);
});

test("庭の最初の芽を通常の移動・Q・光糸とRで摘み、停止中は二つの時計が止まる", async ({
  page,
  browserName,
}) => {
  await enter(page, 15);
  await page.waitForFunction(() =>
    window.__ECHO_LOOM__
      .game()
      .hazards.some(
        (h) => h.kind === "bloom" && !h.cancelled && h.age > 0.1 && h.age < 0.8,
      ),
  );
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "潮を待つ", exact: true }).waitFor();
  const read = () =>
    page.evaluate(async () => {
      const g = window.__ECHO_LOOM__.game(),
        { areaWarning } = await import("/src/boss-warning.js");
      return {
        hazards: g.hazards.map((h) => ({ ...h, warning: areaWarning(h) })),
        run: g.run,
        rng: g.rng.state,
      };
    });
  const before = await read();
  await page.waitForTimeout(300);
  expect(await read()).toEqual(before);
  expect(
    before.hazards.some(
      (h) => h.warning && h.warning.progress > 0 && h.warning.progress < 1,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    window.__bossWoven = null;
    const observe = () => {
      const g = window.__ECHO_LOOM__.game();
      const h = g.hazards.find(
        (h) => h.kind === "bloom" && h.charge > 0.1 && h.charge < 0.45,
      );
      if (h)
        window.__bossWoven = {
          x: h.x,
          y: h.y,
          charge: h.charge,
          age: h.age,
          time: g.run.time,
          player: { x: g.player.x, y: g.player.y, r: g.player.r },
        };
      else requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("KeyQ");
  // Begin the real movement before a client-side HUD assertion can consume
  // the bloom's natural windup; capture partial weaving on its actual frame.
  await page.keyboard.down("KeyD");
  await expect(page.locator("#echo-life-status")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__bossWoven));
  const woven = await page.evaluate(() => window.__bossWoven);
  await page.waitForFunction(
    ({ x, y }) =>
      !window.__ECHO_LOOM__
        .game()
        .hazards.some((h) => h.kind === "bloom" && h.x === x && h.y === y),
    woven,
  );
  await page.keyboard.up("KeyD");
  const moved = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game(),
      boss = g.enemies.find((e) => e.kind === "gardener");
    return {
      hp: g.run.hp,
      time: g.run.time,
      player: { x: g.player.x, y: g.player.y, r: g.player.r },
      boss: { x: boss.x, y: boss.y, r: boss.r },
      bossDistance: Math.hypot(g.player.x - boss.x, g.player.y - boss.y),
    };
  });
  expect(woven.charge).toBeGreaterThan(0.1);
  await page.evaluate(() => {
    window.__bossReleaseObserved = null;
    const observe = () => {
      const g = window.__ECHO_LOOM__.game();
      const pulse = g.hazards.find((h) => h.kind === "pulse" && h.friendly);
      if (g.echoes.length === 0 && pulse)
        window.__bossReleaseObserved = {
          time: g.run.time,
          age: pulse.age,
          duration: pulse.duration,
          echoes: g.echoes.length,
        };
      else requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await page.keyboard.press("KeyR");
  await page.waitForFunction(
    () =>
      window.__bossReleaseObserved &&
      !window.__ECHO_LOOM__
        .game()
        .hazards.some((h) => h.kind === "bloom" && !h.cancelled),
  );
  const actual = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      echoes: g.run.echoesCast,
      released: g.echoes.length === 0 && !!window.__bossReleaseObserved,
      hp: g.run.hp,
    };
  });
  const observed = await page.evaluate(() => window.__bossReleaseObserved);
  await writeFile(
    `${assets}/keybindings-boss-pulse-${browserName}.json`,
    JSON.stringify(
      {
        scope:
          "Native Q and D start before awaiting the public HUD. An actual RAF read captures partial weaving without client latency missing that interval; D moves east away from the boss. Read-only positions and actual R pulse recorded; game state and clock unchanged by observation. Final blooms cleared, echoes consumed and HP100 assertions retained.",
        observed,
        woven,
        moved,
        actual,
      },
      null,
      2,
    ) + "\n",
  );
  expect(moved.player.x).toBeGreaterThan(woven.player.x);
  expect(moved.bossDistance).toBeGreaterThan(moved.player.r + moved.boss.r);
  expect(moved.hp).toBe(100);
  expect(actual.echoes).toBeGreaterThan(0);
  expect(actual.released).toBe(true);
  expect(actual.hp).toBe(100);
  expect(observed.age).toBeLessThan(observed.duration);
});

test("渡し守が実際に三つ目の突進を予告し、固定した狙いから通常の移動と回避で外れる", async ({
  page,
}) => {
  await enter(page, 7);
  await page.waitForFunction(() => {
    const b = window.__ECHO_LOOM__.game().boss;
    return b?.state === "windup" && b.plan?.kind === "charge";
  });
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const before = await page.evaluate(async () => {
    const g = window.__ECHO_LOOM__.game(),
      { chargePath } = await import("/src/boss-warning.js");
    return {
      path: chargePath(g, g.boss),
      player: { x: g.player.x, y: g.player.y },
      angle: g.boss.angle,
      hp: g.run.hp,
      run: g.run,
      timer: g.boss.timer,
    };
  });
  expect(before.path.length).toBeGreaterThan(1);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().boss.timer),
  ).toBe(before.timer);
  const observation = page.evaluate(
    () =>
      new Promise((resolve) => {
        const samples = [];
        let charged = false;
        const observe = () => {
          const g = window.__ECHO_LOOM__.game(),
            boss = g.boss;
          if (boss.state === "charge") {
            charged = true;
            samples.push({ angle: boss.angle, x: boss.x, y: boss.y });
          }
          if (charged && boss.state === "recover") resolve(samples);
          else requestAnimationFrame(observe);
        };
        requestAnimationFrame(observe);
      }),
  );
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  const key =
    Math.abs(Math.cos(before.angle)) > Math.abs(Math.sin(before.angle))
      ? "KeyW"
      : "KeyA";
  await page.keyboard.down(key);
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().player.dashCd > 0,
  );
  const dash = await page.evaluate(
    () => window.__ECHO_LOOM__.game().player.dashCd,
  );
  expect(dash).toBeGreaterThan(0);
  const samples = await observation;
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every((sample) => sample.angle === before.angle)).toBe(true);
  await page.keyboard.up(key);
  const after = await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    return {
      hp: g.run.hp,
      player: { x: g.player.x, y: g.player.y },
    };
  });
  expect(after.hp).toBe(before.hp);
  expect(
    Math.hypot(
      after.player.x - before.player.x,
      after.player.y - before.player.y,
    ),
  ).toBeGreaterThan(25);
});
