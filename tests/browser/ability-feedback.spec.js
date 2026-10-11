import { artifactPath } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

const output = (kind, engine) => artifactPath(`echo-ability-${kind}-${engine}`);
async function begin(page) {
  const profile = freshProfile();
  profile.attempts = 2;
  await page.addInitScript(
    ({ key, profile }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(profile));
    },
    { key: SAVE_KEY, profile },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const settings = [];
  for (const [id, checked] of [
    ["flashes", false],
    ["shake", false],
    ["autoAim", true],
  ]) {
    const control = page.locator(`#setting-${id}`);
    await control[checked ? "check" : "uncheck"]();
    const target = await control.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        hit:
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
          el,
        checked: el.checked,
      };
    });
    expect(target).toEqual({ width: 40, height: 40, hit: true, checked });
    settings.push({ id, ...target });
  }
  await page.locator("#setting-shake").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#setting-shake")).toBeChecked();
  await page.keyboard.press("Space");
  await expect(page.locator("#setting-shake")).not.toBeChecked();
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("ABILITY-LIGHT");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().history.length >= 45,
  );
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  return settings;
}
async function frozen(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return page.evaluate(async (key) => {
    const game = window.__ECHO_LOOM__.game(),
      c = document.querySelector("#world");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    return {
      game: JSON.stringify(game),
      pixels: [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      save: localStorage.getItem(key),
      echoes: game.echoes.map((e) => ({ x: e.x, y: e.y, elapsed: e.elapsed })),
      pulses: game.hazards
        .filter((h) => h.kind === "pulse" && h.friendly)
        .map((h) => ({ ...h })),
    };
  }, SAVE_KEY);
}
async function stop(page) {
  await page.locator('[data-action="pause"]').click();
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
  return before;
}

test("公開Q/R：実際の出現と解放・350msの停止・保存からの再開", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await begin(page);
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 1,
  );
  const arrival = await stop(page);
  expect(arrival.echoes[0].elapsed).toBeLessThan(0.35);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() =>
    window.__ECHO_LOOM__
      .game()
      .hazards.some((h) => h.kind === "pulse" && h.friendly),
  );
  const release = await stop(page);
  expect(release.echoes).toHaveLength(0);
  expect(release.pulses).toHaveLength(1);
  expect(release.pulses[0].age).toBeLessThan(0.4);
  await page.screenshot({ path: `${output("native", browserName)}.png` });
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const saved = await page.evaluate(
    (key) => localStorage.getItem(key),
    SAVE_KEY,
  );
  expect(JSON.parse(saved).run.seed).toBe("ABILITY-LIGHT");
  await page.reload();
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await page.locator('[data-action="pause"]').click();
  const reloaded = await frozen(page);
  expect(reloaded.echoes).toHaveLength(0);
  expect(reloaded.pulses).toHaveLength(0);
  expect(reloaded.save).toBe(saved);
  expect(errors).toEqual([]);
  await writeFile(
    `${output("native", browserName)}.json`,
    JSON.stringify(
      {
        scope:
          "Native public first-room Q/R; only attempts skip intro. Public no-flashes settings, no actor/HP/history/RNG/clock preparation. 350ms exact game/pixels/save; same entry on reload.",
        arrival,
        release,
        reloaded,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("実画素比較：出現と解放だけの範囲・敵の予告と弾の手前・時計と状態の保持", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (key) => {
    const [{ Renderer }, { Renderer: Before }, { Game, createRun }] =
      await Promise.all([
        import("/src/render.js"),
        import("/tests/fixtures/reference/rifts-ability-baseline-render.mjs"),
        import("/src/game.js"),
      ]);
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      return c;
    };
    const current = new Renderer(canvas()),
      old = new Before(canvas());
    const rows = [];
    const save = localStorage.getItem(key);
    for (const stage of [0, 8, 16])
      for (const radius of [48, 108])
        for (const age of [0, 0.1, 0.3, 0.4])
          for (const elapsed of [0, 0.1, 0.34, 0.35])
            for (const flashes of [false, true]) {
              const run = createRun("ABILITY-PIXELS");
              run.stage = stage;
              const g = new Game(run);
              g.spawnQueue = [];
              g.enemies = [];
              g.particles = [];
              g.labels = [];
              g.pickups = [];
              g.history = Array.from({ length: 30 }, () => ({
                x: 150,
                y: 140,
                angle: 0,
                fire: false,
              }));
              g.castEcho();
              g.particles = [];
              Object.assign(g.echoes[0], { elapsed });
              g.hazards = [
                {
                  kind: "pulse",
                  friendly: true,
                  x: 300,
                  y: 145,
                  r: radius,
                  age,
                  duration: 0.4,
                },
              ];
              const state = JSON.stringify(g),
                settings = { flashes, shake: false };
              old.draw(g, 0, settings);
              current.draw(g, 0, settings);
              const before = old.g.getImageData(0, 0, 480, 300).data,
                after = current.g.getImageData(0, 0, 480, 300).data;
              let changed = 0,
                outside = 0;
              for (let i = 0; i < before.length; i += 4)
                if ([0, 1, 2, 3].some((k) => before[i + k] !== after[i + k])) {
                  changed++;
                  const x = (i / 4) % 480,
                    y = Math.floor(i / 4 / 480);
                  const birth =
                    elapsed < 0.35 &&
                    Math.abs(x - 150) <= 23 &&
                    Math.abs(y - 140) <= 17;
                  const pulse =
                    age <= 0.4 &&
                    Math.abs(x - 300) <= radius + 2 &&
                    Math.abs(y - 145) <= radius + 2;
                  if (!birth && !pulse) outside++;
                }
              current.draw(g, 40, settings);
              const paused = current.g.getImageData(0, 0, 480, 300).data;
              if (
                after.some((v, i) => v !== paused[i]) ||
                state !== JSON.stringify(g) ||
                localStorage.getItem(key) !== save
              )
                throw Error(
                  "Presentation changed paused pixels, game/RNG or save",
                );
              if (outside) throw Error("Ability changed unrelated pixels");
              // At an expired pulse the old fixture still contains its final ring, so
              // no-cue equality is checked separately with the expired hazard removed.
              if (age < 0.4 && changed === 0)
                throw Error("Release cue missing");
              rows.push({
                stage,
                radius,
                age,
                elapsed,
                flashes,
                changed,
                outside,
              });
            }
    const g = new Game(createRun("ABILITY-LAYERS"));
    g.spawnQueue = [];
    g.enemies = [];
    g.particles = [];
    g.labels = [];
    g.pickups = [];
    const hostile = {
      kind: "blast",
      friendly: false,
      weavable: true,
      x: 128,
      y: 160,
      r: 15,
      age: 0.2,
      duration: 2,
      charge: 0,
    };
    const pulse = {
      kind: "pulse",
      friendly: true,
      x: 80,
      y: 160,
      r: 48,
      age: 0.1,
      duration: 0.4,
    };
    g.bullets = [
      { x: 80, y: 112, r: 3, color: "#efa88c", friendly: false, life: 1 },
    ];
    const pixel = (renderer, x, y) => [
      ...renderer.g.getImageData(x, y, 1, 1).data,
    ];
    const settings = { flashes: false, shake: false };
    g.hazards = [hostile];
    current.draw(g, 0, settings);
    const expectedMarker = pixel(current, 128, 160),
      expectedBullet = pixel(current, 80, 112);
    old.draw(g, 0, settings);
    const currentWithoutCue = current.g.getImageData(0, 0, 480, 300).data;
    const noCueEqual = old.g
      .getImageData(0, 0, 480, 300)
      .data.every((v, i) => v === currentWithoutCue[i]);
    if (!noCueEqual) throw Error("No-ability pixels changed");
    g.hazards = [hostile, pulse];
    old.draw(g, 0, settings);
    const oldMarker = pixel(old, 128, 160);
    current.draw(g, 0, settings);
    const newMarker = pixel(current, 128, 160),
      newBullet = pixel(current, 80, 112);
    if (
      JSON.stringify(newMarker) !== JSON.stringify(expectedMarker) ||
      JSON.stringify(newBullet) !== JSON.stringify(expectedBullet) ||
      JSON.stringify(oldMarker) === JSON.stringify(expectedMarker)
    )
      throw Error("Warning/bullet layering not proven");
    return {
      rows,
      noCueEqual,
      layers: {
        expectedMarker,
        expectedBullet,
        oldMarker,
        newMarker,
        newBullet,
      },
    };
  }, SAVE_KEY);
  expect(result.rows).toHaveLength(192);
  expect(result.rows.every((x) => x.outside === 0)).toBe(true);
  await writeFile(
    `${output("pixels", browserName)}.json`,
    JSON.stringify(
      {
        scope:
          "Controlled old/current Renderer comparison: three biomes, two real upgrade radii, four ages, four replay ages, both flash settings. Prescribed actors/hazards and expired-boundary fixtures are not earned gameplay. 192 actual RGBA scenes; independent opaque warning/bullet samples prove foreground order.",
        ...result,
      },
      null,
      2,
    ) + "\n",
  );
});

test("タッチQ/Rと三サイズ・静かな糸目と整数画素・描画状態の復元", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const settings = await begin(page);
    await page.locator('[data-touch-action="echo"]').tap();
    await page.waitForFunction(
      () => window.__ECHO_LOOM__.game().echoes.length === 1,
    );
    const arrival = await stop(page);
    expect(arrival.echoes[0].elapsed).toBeLessThan(0.35);
    await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
    await page.locator('[data-touch-action="burst"]').tap();
    await page.waitForFunction(() =>
      window.__ECHO_LOOM__
        .game()
        .hazards.some((h) => h.kind === "pulse" && h.friendly),
    );
    const release = await stop(page);
    const layouts = [];
    for (const viewport of [
      { width: 360, height: 640 },
      { width: 640, height: 360 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const r = await page.locator("#world").boundingBox();
      expect(r.width / r.height).toBeCloseTo(1.6, 5);
      expect(await frozen(page)).toEqual(release);
      layouts.push({ viewport, ratio: r.width / r.height });
    }
    const geometry = await page.evaluate(async () => {
      const { drawEchoArrival, drawReleasePulse } = await import(
        "/src/ability-render.js"
      );
      const samples = [];
      const c = document.createElement("canvas").getContext("2d");
      for (const kind of ["arrival", "release"]) {
        const shapes = [];
        for (const p of [0.05, 0.2, 0.7]) {
          const calls = [];
          const original = c.fillRect.bind(c);
          c.fillRect = (...args) => {
            if (args.some((n) => !Number.isInteger(n)))
              throw Error("Fractional ability pixel");
            calls.push({ args, alpha: c.globalAlpha, color: c.fillStyle });
            original(...args);
          };
          c.globalAlpha = 0.37;
          c.fillStyle = "#123456";
          const before = [
            c.globalAlpha,
            c.fillStyle,
            c.globalCompositeOperation,
          ];
          if (kind === "arrival")
            drawEchoArrival(
              c,
              { x: 100.3, y: 80.6, elapsed: p * 0.35 },
              { flashes: false },
            );
          else
            drawReleasePulse(
              c,
              {
                kind: "pulse",
                friendly: true,
                x: 100.3,
                y: 80.6,
                r: 48,
                age: p * 0.4,
                duration: 0.4,
              },
              { flashes: false },
            );
          const after = [
            c.globalAlpha,
            c.fillStyle,
            c.globalCompositeOperation,
          ];
          if (JSON.stringify(before) !== JSON.stringify(after))
            throw Error("Canvas state leaked");
          c.fillRect = original;
          shapes.push(calls);
          samples.push({
            kind,
            p,
            pixels: calls.length,
            maximumAlpha: Math.max(...calls.map((x) => x.alpha)),
            restored: true,
          });
        }
        const geometry = (shape) =>
          JSON.stringify(shape.map(({ args, color }) => ({ args, color })));
        if (shapes.some((shape) => geometry(shape) !== geometry(shapes[0])))
          throw Error("No-flashes geometry moves");
        for (let i = 1; i < shapes.length; i++)
          if (shapes[i].some((call, j) => call.alpha > shapes[i - 1][j].alpha))
            throw Error("Quiet cue brightened again");
      }
      return samples;
    });
    expect(errors).toEqual([]);
    await writeFile(
      `${output("touch", browserName)}.json`,
      JSON.stringify(
        {
          scope:
            "Native browser touchscreen taps for public Q/R; keyboard records the route first. Three viewport sizes and exact paused game/pixels/save. Separately controlled offscreen Canvas samples check integer primitives, fixed no-flashes geometry, monotonic fade and state restoration; not physical touch hardware.",
          arrival,
          release,
          settings,
          layouts,
          geometry,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await context.close();
  }
});
