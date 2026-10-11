import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { freshProfile, SAVE_KEY } from "../../src/save.js";

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
  await page.locator("#setting-flashes").uncheck();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-autoAim").check();
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("RECORDING-LIGHT");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.keyboard.down("KeyJ");
  for (const key of ["KeyD", "KeyW", "KeyA"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(350);
    await page.keyboard.up(key);
  }
  await page.keyboard.up("KeyJ");
}
async function frozen(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return page.evaluate(async (key) => {
    const g = window.__ECHO_LOOM__.game();
    const c = document.querySelector("#world");
    const { echoRecording, recordingLabel } = await import(
      "/src/recording-preview.js"
    );
    const digest = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    const recording = echoRecording(g);
    return {
      game: JSON.stringify(g),
      pixels: [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      save: localStorage.getItem(key),
      recording,
      label: recordingLabel(recording),
      hud: document.querySelector("#echo-next").textContent,
    };
  }, SAVE_KEY);
}
async function pause(page) {
  await page.locator('[data-action="pause"]').click();
  await page.waitForTimeout(120);
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
  return before;
}
async function observeCall(page) {
  await page.evaluate(async () => {
    const { echoRecording } = await import("/src/recording-preview.js");
    const g = window.__ECHO_LOOM__.game(),
      original = g.castEcho;
    g.castEcho = function (...args) {
      const before = echoRecording(this);
      const result = Reflect.apply(original, this, args);
      window.__recordingCall = {
        before,
        actual: structuredClone(this.echoes.at(-1).frames),
      };
      return result;
    };
  });
}
function verifyCall(call) {
  expect(call.before.available).toBe(true);
  expect(call.before.points).toEqual(call.actual.map(({ x, y }) => ({ x, y })));
  expect(call.before.shots).toEqual(
    call.actual.flatMap((f, frame) =>
      f.fire ? [{ x: f.x, y: f.y, angle: f.angle, frame }] : [],
    ),
  );
  expect(call.before.origin).toEqual({
    x: call.actual[0].x,
    y: call.actual[0].y,
  });
}

test("公開の録画とQ：始点・道・射撃が実際の再生に一致し、停止と再開を保つ", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await begin(page);
  const recording = await pause(page);
  expect(recording.recording.available).toBe(true);
  expect(recording.recording.shots.length).toBeGreaterThan(0);
  expect(recording.hud).toBe(recording.label);
  await page.screenshot({
    path: `/tmp/echo-recording-native-${browserName}.png`,
  });
  await page.getByRole("button", { name: "操作と残響の使い方" }).click();
  await expect(page.locator("#recording-help")).toContainText(
    "四角が残響の始点",
  );
  await expect(page.locator("#recording-help")).toContainText(
    "金の糸目が射撃の方向",
  );
  await observeCall(page);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(() => Boolean(window.__recordingCall));
  const call = await page.evaluate(() => window.__recordingCall);
  verifyCall(call);
  const called = await pause(page);
  expect(called.recording.available).toBe(false);
  expect(called.hud).toContain("次の1回");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const saved = await page.evaluate(
    (key) => localStorage.getItem(key),
    SAVE_KEY,
  );
  await page.reload();
  await page.evaluate(() => {
    function firstFrame() {
      const g = window.__ECHO_LOOM__.game();
      if (g)
        window.__recordingEntry = {
          frames: structuredClone(g.history),
          echoes: g.echoes.length,
          seed: g.run.seed,
        };
      else requestAnimationFrame(firstFrame);
    }
    requestAnimationFrame(firstFrame);
  });
  await page.getByRole("button", { name: "航路を続ける" }).click();
  await page.waitForFunction(() => Boolean(window.__recordingEntry));
  const entry = await page.evaluate(() => window.__recordingEntry);
  const reopened = await pause(page);
  expect(entry.frames.length).toBeLessThan(24);
  expect(entry.echoes).toBe(0);
  expect(entry.seed).toBe("RECORDING-LIGHT");
  expect(reopened.save).toBe(saved);
  expect(errors).toEqual([]);
  await writeFile(
    `/tmp/echo-recording-native-${browserName}.json`,
    JSON.stringify(
      {
        scope:
          "Native public movement/fire/Q and help, actual recording/cast correspondence and 350ms exact state/RGBA/save pauses. Only attempts skip intro. Read-only cast observer calls original once with identical receiver/arguments after the normal update has recorded that tick; no actor/HP/history/RNG/clock preparation. An independent first-RAF read observes the fresh entry recording before later client calls can add more natural frames.",
        recording,
        call,
        called,
        entry,
        reopened,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("三地域と三武器：変化は実際の録画の周りだけで、敵の予告と弾を手前に保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async (key) => {
    const [
      { Game, createRun },
      { Renderer },
      { Renderer: Before },
      { segmentDistance },
    ] = await Promise.all([
      import("/src/game.js"),
      import("/src/render.js"),
      import(
        "/.mdxr/20261007195700-echo-loom/assets/rifts-recording-baseline-render.mjs"
      ),
      import("/src/math.js"),
    ]);
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      return c;
    };
    const current = new Renderer(canvas()),
      old = new Before(canvas());
    const save = localStorage.getItem(key),
      rows = [];
    for (const stage of [0, 8, 16])
      for (const weapon of ["needle", "scatter", "prism"])
        for (const shape of ["corner", "stationary", "crossing", "dash"])
          for (const charges of [0, 1])
            for (const flashes of [false, true]) {
              const run = createRun("RECORDING-PIXELS", weapon);
              run.stage = stage;
              const g = new Game(run);
              g.enemies = [];
              g.spawnQueue = [];
              g.particles = [];
              g.labels = [];
              g.pickups = [];
              g.bullets = [];
              g.hazards = [];
              g.player.echoCharges = charges;
              g.history = Array.from({ length: 216 }, (_, i) => {
                let x = 140,
                  y = 160;
                if (shape === "corner") {
                  x += Math.min(i, 100) / 2;
                  y -= Math.max(0, i - 100) / 2;
                }
                if (shape === "crossing") {
                  x += Math.sin(i / 30) * 35;
                  y += Math.sin(i / 15) * 20;
                }
                if (shape === "dash") x += Math.min(i, 24) * 4.8;
                return { x, y, angle: i / 20, fire: i % 12 === 0 };
              });
              const settings = { flashes, shake: false },
                state = JSON.stringify(g);
              old.draw(g, 0, settings);
              current.draw(g, 0, settings);
              const before = old.g.getImageData(0, 0, 480, 300).data,
                after = current.g.getImageData(0, 0, 480, 300).data;
              const lines = g.history.slice(1).map((f, i) => [
                { x: g.history[i].x, y: g.history[i].y + 4 },
                { x: f.x, y: f.y + 4 },
              ]);
              const shots = g.history
                .filter((f) => f.fire)
                .map((f) => [
                  {
                    x: f.x + Math.cos(f.angle) * 3,
                    y: f.y - 3 + Math.sin(f.angle) * 3,
                  },
                  {
                    x: f.x + Math.cos(f.angle) * 8,
                    y: f.y - 3 + Math.sin(f.angle) * 8,
                  },
                ]);
              const footprints = [...lines, ...shots];
              let changed = 0,
                outside = 0;
              for (let i = 0; i < before.length; i += 4)
                if ([0, 1, 2, 3].some((k) => before[i + k] !== after[i + k])) {
                  changed++;
                  const p = { x: (i / 4) % 480, y: Math.floor(i / 4 / 480) },
                    origin = g.history[0];
                  const marker =
                    Math.abs(p.x - origin.x) <= 8 &&
                    Math.abs(p.y - origin.y) <= 10;
                  if (
                    !marker &&
                    !footprints.some(
                      ([a, b]) => segmentDistance(p, a, b) <= 1.5,
                    )
                  )
                    outside++;
                }
              current.draw(g, 60, settings);
              const paused = current.g.getImageData(0, 0, 480, 300).data;
              if (after.some((v, i) => v !== paused[i]))
                throw Error("Paused preview uses wall clock");
              if (
                state !== JSON.stringify(g) ||
                save !== localStorage.getItem(key)
              )
                throw Error("Preview mutated game/RNG/save");
              if (outside || (charges === 0 ? changed !== 0 : changed === 0))
                throw Error("Wrong recording footprint or availability");
              rows.push({
                stage,
                weapon,
                shape,
                charges,
                flashes,
                changed,
                outside,
              });
            }
    const g = new Game(createRun("RECORDING-LAYERS"));
    g.spawnQueue = [];
    g.enemies = [];
    g.particles = [];
    g.labels = [];
    g.pickups = [];
    g.history = Array.from({ length: 24 }, (_, i) => ({
      x: 80 + i,
      y: 156,
      angle: 0,
      fire: i === 0,
    }));
    g.hazards = [
      {
        kind: "blast",
        friendly: false,
        weavable: true,
        x: 90,
        y: 160,
        r: 15,
        age: 0.2,
        duration: 2,
        charge: 0,
      },
    ];
    g.bullets = [
      { x: 96, y: 160, r: 3, friendly: false, color: "#efa88c", life: 1 },
    ];
    const settings = { flashes: false, shake: false },
      samples = (r) => ({
        marker: [...r.g.getImageData(90, 160, 1, 1).data],
        bullet: [...r.g.getImageData(96, 160, 1, 1).data],
      });
    const hazards = g.hazards,
      bullets = g.bullets;
    g.hazards = [];
    g.bullets = [];
    old.draw(g, 0, settings);
    const bareBefore = samples(old);
    current.draw(g, 0, settings);
    const bareAfter = samples(current);
    if (
      JSON.stringify(bareBefore.marker) === JSON.stringify(bareAfter.marker) ||
      JSON.stringify(bareBefore.bullet) === JSON.stringify(bareAfter.bullet)
    )
      throw Error("Priority sample does not overlap a recording pixel");
    g.hazards = hazards;
    g.bullets = bullets;
    old.draw(g, 0, settings);
    const expected = samples(old);
    current.draw(g, 0, settings);
    const actual = samples(current);
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw Error("Recording covers a warning or bullet");
    if (
      JSON.stringify(expected.marker) !==
        JSON.stringify([217, 193, 229, 255]) ||
      JSON.stringify(expected.bullet) !== JSON.stringify([255, 228, 189, 255])
    )
      throw Error("Priority sample is not the opaque warning or bullet");
    const noPreview = [];
    for (const mode of ["camp", "reward", "dead"]) {
      g.mode = mode;
      old.draw(g, 0, settings);
      current.draw(g, 0, settings);
      const a = old.g.getImageData(0, 0, 480, 300).data,
        b = current.g.getImageData(0, 0, 480, 300).data;
      if (a.some((v, i) => v !== b[i]))
        throw Error("Preview outside playable modes");
      noPreview.push(mode);
    }
    return {
      rows,
      layers: { expected, actual, bareBefore, bareAfter },
      noPreview,
    };
  }, SAVE_KEY);
  expect(result.rows).toHaveLength(144);
  await writeFile(
    `/tmp/echo-recording-pixels-${browserName}.json`,
    JSON.stringify(
      {
        scope:
          "Controlled old/current RGBA fixtures, 144 scenes per engine: three biomes/weapons, four prescribed recorded routes, two charge states and flash settings. Changed pixels are independently bounded to real recorded segments, firing directions or origin; paused wall-time equality and game/RNG/save immutability. Separate opaque enemy warning/bullet samples and non-playable modes. Not earned combat.",
        ...result,
      },
      null,
      2,
    ) + "\n",
  );
});

test("タッチのQと三サイズ：録画を読み、静かな整数画素と重なりを保つ", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await begin(page);
    const recording = await pause(page),
      layouts = [];
    for (const viewport of [
      { width: 360, height: 640 },
      { width: 640, height: 360 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      expect(await frozen(page)).toEqual(recording);
      const c = await page.locator("#world").boundingBox();
      expect(c.width / c.height).toBeCloseTo(1.6, 5);
      const label = await page.locator("#echo-next").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          font: parseFloat(getComputedStyle(el).fontSize),
          width: r.width,
          height: r.height,
          noOverflow: el.scrollWidth <= el.clientWidth,
          inside:
            r.x >= 0 &&
            r.right <= innerWidth &&
            r.y >= 0 &&
            r.bottom <= innerHeight,
        };
      });
      expect(label.font).toBeGreaterThanOrEqual(10);
      expect(label.noOverflow && label.inside).toBe(true);
      layouts.push({ viewport, label, ratio: c.width / c.height });
    }
    await page.setViewportSize({ width: 640, height: 360 });
    await observeCall(page);
    await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
    await page.locator('[data-touch-action="echo"]').tap();
    await page.waitForFunction(() => Boolean(window.__recordingCall));
    const call = await page.evaluate(() => window.__recordingCall);
    verifyCall(call);
    const called = await pause(page);
    expect(called.recording.available).toBe(false);
    const geometry = await page.evaluate(async () => {
      const { drawRecordingPreview } = await import("/src/recording-render.js");
      const c = document.createElement("canvas").getContext("2d"),
        calls = [];
      const fill = c.fillRect.bind(c);
      c.fillRect = (...args) => {
        if (args.some((v) => !Number.isInteger(v)))
          throw Error("Fractional recording pixel");
        calls.push({ args, color: c.fillStyle, alpha: c.globalAlpha });
        fill(...args);
      };
      c.globalAlpha = 0.37;
      c.fillStyle = "#123456";
      c.globalCompositeOperation = "multiply";
      const before = [c.globalAlpha, c.fillStyle, c.globalCompositeOperation];
      const game = {
        mode: "combat",
        player: { echoCharges: 1 },
        history: Array.from({ length: 216 }, () => ({
          x: 100.4,
          y: 80.6,
          angle: 0.3,
          fire: true,
        })),
      };
      drawRecordingPreview(c, game);
      const after = [c.globalAlpha, c.fillStyle, c.globalCompositeOperation];
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw Error("Recording leaked Canvas state");
      const shots = calls.filter((x) => x.color === "#d0b380");
      if (
        new Set(shots.map((x) => JSON.stringify(x.args))).size !== shots.length
      )
        throw Error("Repeated shots accumulate opacity");
      return {
        pixels: calls.length,
        shotPixels: shots.length,
        restored: true,
        duplicateShotPixels: 0,
        integerPixels: true,
      };
    });
    await writeFile(
      `/tmp/echo-recording-touch-${browserName}.json`,
      JSON.stringify(
        {
          scope:
            "Native browser touchscreen Q; keyboard records the real route first. Three paused sizes preserve game/RGBA/save and fit the 10px public recording label. Separately controlled offscreen Canvas checks integers, state restoration and repeated-shot opacity; not physical hardware.",
          recording,
          layouts,
          call,
          called,
          geometry,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await context.close();
  }
});
