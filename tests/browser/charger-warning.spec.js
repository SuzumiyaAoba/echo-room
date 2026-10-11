import { test, expect } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY, prepareImport } from "../../src/save.js";
import { catalogUpgrades } from "../../src/content.js";
const assets = ".mdxr/20261007195700-echo-loom/assets";
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function depart(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-flashes").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("RUSH-FIRST");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page
    .getByRole("button", { name: "最初のひと針へ →", exact: true })
    .click();
}
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const snapshot = (page) =>
  page.evaluate(
    (key) => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      world: document.querySelector("#world").toDataURL("image/png"),
      body: document.body.innerText,
      save: localStorage.getItem(key),
    }),
    SAVE_KEY,
  );
async function winding(page) {
  await page.waitForFunction(() =>
    window.__ECHO_LOOM__
      .game()
      .enemies.some((e) => e.kind === "charger" && e.state === "windup"),
  );
  await page.keyboard.press("Escape");
  return page.evaluate(async () => {
    const raw = window.__ECHO_LOOM__.game(),
      { Game } = await import("/src/game.js"),
      { chargerWarning } = await import("/src/charger-warning.js");
    // Only this detached diagnostic copy gets assigned; the live game is read.
    const g = new Game(structuredClone(raw.run));
    Object.assign(g, raw);
    const enemy = g.enemies.find(
      (e) => e.kind === "charger" && e.state === "windup",
    );
    return {
      enemy,
      warning: chargerWarning(g, enemy),
      hp: g.run.hp,
      damageTaken: g.run.damageTaken,
      time: g.t,
    };
  });
}

test("公開の突進の幅と終点を読み、四画面の停止を保ち、通常の横移動で回避する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await depart(page);
  const initial = await saved(page);
  expect(initial.run.chargeVersion).toBe(1);
  const observed = await winding(page);
  expect(observed.warning).not.toBeNull();
  const frozen = await snapshot(page);
  await page.waitForTimeout(350);
  expect(await snapshot(page)).toEqual(frozen);
  expect(await saved(page)).toEqual(initial);
  await writeFile(
    `${assets}/rush-after-${info.project.name}.png`,
    Buffer.from(frozen.world.split(",")[1], "base64"),
  );
  const displays = [];
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    expect((await snapshot(page)).world).toBe(frozen.world);
    const layout = await page.locator("#world").evaluate((c) => {
      const r = c.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        scale: r.width / 480,
      };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(size.width);
    expect(layout.bottom).toBeLessThanOrEqual(size.height);
    displays.push({ size, ...layout });
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  const tracePromise = page.evaluate(
    ({ id, damageTaken }) =>
      new Promise((resolve, reject) => {
        const points = [],
          impacts = [],
          player = [],
          started = performance.now();
        let sawCharge = false,
          previousDamage = damageTaken;
        function read() {
          const g = window.__ECHO_LOOM__.game(),
            e = g.enemies.find((e) => e.id === id);
          if (!e) return reject(Error("Charger disappeared"));
          player.push({ x: g.player.x, y: g.player.y, time: g.t });
          if (g.run.damageTaken > previousDamage)
            impacts.push({
              time: g.t,
              damage: g.run.damageTaken - previousDamage,
              source: g.hitCue?.source,
            });
          previousDamage = g.run.damageTaken;
          if (e.state === "charge") {
            sawCharge = true;
            points.push({ x: e.x, y: e.y, angle: e.angle, time: g.t });
          }
          if (sawCharge && e.state === "recover")
            return resolve({
              points,
              impacts,
              player,
              end: { x: e.x, y: e.y },
              hp: g.run.hp,
              angle: e.angle,
            });
          if (performance.now() - started > 10000)
            return reject(Error("No natural charge/recovery"));
          requestAnimationFrame(read);
        }
        requestAnimationFrame(read);
      }),
    { id: observed.enemy.id, damageTaken: observed.damageTaken },
  );
  const startX = await page.evaluate(
    () => window.__ECHO_LOOM__.game().player.x,
  );
  await page.keyboard.down("KeyA");
  await page.waitForFunction(
    (x) => window.__ECHO_LOOM__.game().player.x <= x - 60,
    startX,
  );
  await page.keyboard.up("KeyA");
  const trace = await tracePromise;
  await writeFile(
    `${assets}/rush-trace-${info.project.name}.json`,
    JSON.stringify({ observed, trace }, null, 2),
  );
  expect(trace.points.length).toBeGreaterThan(0);
  expect(trace.hp).toBe(observed.hp);
  expect(trace.angle).toBe(observed.enemy.angle);
  for (const p of trace.points)
    expect(
      observed.warning.path.some(
        (q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-8,
      ),
    ).toBe(true);
  expect(trace.end).toEqual(observed.warning.path.at(-1));
  await page.keyboard.press("Escape");
  expect(await saved(page)).toEqual(initial);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/rush-native-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Fresh public departure, natural windup, public Escape freeze, four CSS sizes and native A side-step until the actual player moves 60 dots. Read-only live snapshots; warning calculation uses a detached diagnostic copy. Native trace samples rendered frames, not every fixed simulation tick. Full fixed-tick equality is separately tested in 1440 prepared conditions. No live Game/profile/clock/RNG writes.",
        observed,
        trace,
        displays,
        pauseMilliseconds: 350,
        fullFreezeExact: true,
        saveExact: true,
        sha256: {
          game: sha(frozen.game),
          world: sha(Buffer.from(frozen.world.split(",")[1], "base64")),
          body: sha(frozen.body),
          save: sha(frozen.save),
        },
        errors,
      },
      null,
      2,
    ),
  );
});

test("三地域・八方向・通常と強敵の576場面で危険帯以外の画素・戦闘・乱数を保つ", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [
      { Game, createRun },
      { Renderer },
      { Renderer: Before },
      { chargerWarning },
      { segmentDistance },
      { ENEMIES },
    ] = await Promise.all([
      import("/src/game.js"),
      import("/src/render.js"),
      import("/tests/fixtures/shell-aligned/rush-render.js"),
      import("/src/charger-warning.js"),
      import("/src/math.js"),
      import("/src/content.js"),
    ]);
    const before = new Before(document.createElement("canvas")),
      current = new Renderer(document.createElement("canvas")),
      repeated = new Renderer(document.createElement("canvas")),
      rows = [];
    const storage = JSON.stringify(localStorage),
      sheet = document.createElement("canvas");
    sheet.width = 960;
    sheet.height = 600;
    const sc = sheet.getContext("2d");
    let pictures = 0;
    function model(stage) {
      const run = createRun("RUSH-PIXELS");
      run.stage = stage;
      const g = new Game(run);
      g.enemies = [];
      g.spawnQueue = [{ time: Infinity }];
      g.t = 0.4;
      g.particles = [];
      g.labels = [];
      for (const row of g.tiles)
        for (let x = 0; x < row.length; x++) if (row[x] === 2) row[x] = 0;
      return g;
    }
    for (const stage of [0, 8, 16])
      for (const elite of [false, true])
        for (let direction = 0; direction < 8; direction++)
          for (const timer of [0.8, 0.4, 0.02])
            for (const flashes of [false, true])
              for (const x of [180, 435]) {
                const g = model(stage),
                  e = g.spawn("charger", x, 150, elite);
                Object.assign(e, {
                  state: "windup",
                  timer,
                  angle: (direction * Math.PI) / 4,
                });
                g.particles = [];
                const state = JSON.stringify(g),
                  rng = g.rng.state,
                  warning = chargerWarning(g, e),
                  settings = { shake: false, flashes };
                before.draw(g, 0.4, settings);
                current.draw(g, 0.4, settings);
                repeated.draw(g, 60, settings);
                const a = before.g.getImageData(0, 0, 480, 300).data,
                  b = current.g.getImageData(0, 0, 480, 300).data,
                  c = repeated.g.getImageData(0, 0, 480, 300).data;
                const oldEnd = {
                    x: e.x + Math.cos(e.angle) * 110,
                    y: e.y + Math.sin(e.angle) * 110,
                  },
                  left = Math.round(e.x) - 9,
                  top = Math.min(268, Math.round(e.y + e.r) + 7) - 1;
                let changed = 0,
                  outside = 0;
                for (let i = 0; i < b.length; i += 4) {
                  if (
                    b[i] !== c[i] ||
                    b[i + 1] !== c[i + 1] ||
                    b[i + 2] !== c[i + 2] ||
                    b[i + 3] !== c[i + 3]
                  )
                    throw Error("Paused pixels changed");
                  if (
                    a[i] === b[i] &&
                    a[i + 1] === b[i + 1] &&
                    a[i + 2] === b[i + 2] &&
                    a[i + 3] === b[i + 3]
                  )
                    continue;
                  changed++;
                  const p = { x: (i / 4) % 480, y: Math.floor(i / 4 / 480) };
                  const inLane = warning.path.some(
                      (q) =>
                        Math.hypot(p.x - q.x, p.y - q.y) <=
                        warning.radius + 1.6,
                    ),
                    inOld = segmentDistance(p, e, oldEnd) <= 2.4,
                    inTicks =
                      p.x >= left &&
                      p.x <= left + 17 &&
                      p.y >= top &&
                      p.y <= top + 4;
                  if (!inLane && !inOld && !inTicks) outside++;
                }
                if (
                  !changed ||
                  outside ||
                  JSON.stringify(g) !== state ||
                  g.rng.state !== rng
                )
                  throw Error(
                    `Bad warning ${stage}/${elite}/${direction}/${timer}/${flashes}/${x}: ${changed}/${outside}`,
                  );
                rows.push({
                  stage,
                  elite,
                  direction,
                  timer,
                  flashes,
                  x,
                  changed,
                  outside,
                  gameExact: true,
                  rngExact: true,
                  repeatPixelsExact: true,
                });
                if (!elite && direction === 0 && timer === 0.4 && !flashes) {
                  sc.drawImage(
                    current.buffer,
                    x === 180 ? 0 : 480,
                    (stage / 8) * 200,
                    480,
                    200,
                  );
                }
                pictures++;
              }
    let legacyExact = 0;
    for (const version of [undefined, 2])
      for (const kind of Object.keys(ENEMIES)) {
        const g = model(0);
        if (version === undefined) delete g.run.chargeVersion;
        else g.run.chargeVersion = version;
        const e = g.spawn(kind, 180, 150);
        Object.assign(e, { state: "windup", timer: 0.4, angle: 0.4 });
        g.particles = [];
        const state = JSON.stringify(g);
        before.draw(g, 0.4, { shake: false, flashes: false });
        current.draw(g, 0.4, { shake: false, flashes: false });
        const a = before.g.getImageData(0, 0, 480, 300).data,
          b = current.g.getImageData(0, 0, 480, 300).data;
        if (a.some((v, i) => v !== b[i]) || JSON.stringify(g) !== state)
          throw Error("Legacy world changed");
        legacyExact++;
      }
    if (JSON.stringify(localStorage) !== storage)
      throw Error("Storage changed");
    return {
      scope:
        "Prepared renderer scenes, prescribed enemy positions/angles/timers and cleared cosmetic particles. Independent path-disc, original-line and tick-box bounds classify every changed pixel. Live public input is verified separately.",
      configurations: pictures,
      rows,
      legacyExact,
      storageExact: true,
      sheet: sheet.toDataURL("image/png"),
    };
  });
  expect(result.configurations).toBe(576);
  expect(result.legacyExact).toBe(18);
  await writeFile(
    `${assets}/rush-sheet-${browserName}.png`,
    Buffer.from(result.sheet.split(",")[1], "base64"),
  );
  delete result.sheet;
  await writeFile(
    `${assets}/rush-pixels-${browserName}.json`,
    JSON.stringify(result, null, 2),
  );
});

test("新しい旅の版を公開ファイルと再開で保持し、獲得した旧旅は元の予告で再開する", async ({
  page,
}, info) => {
  await depart(page);
  const initial = await saved(page);
  expect(initial.run.chargeVersion).toBe(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const download = await downloadPromise,
    path = `${assets}/rush-export-${info.project.name}.json`;
  await download.saveAs(path);
  const bytes = await readFile(path);
  const portable = structuredClone(initial);
  portable.run.upgrades = Object.fromEntries(
    catalogUpgrades(portable.run).map((u) => [
      u.id,
      initial.run.upgrades[u.id] || 0,
    ]),
  );
  expect(prepareImport(bytes.toString()).profile).toEqual(portable);
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles(path);
  await page.locator('[data-action="importrecord"]').click();
  expect(await saved(page)).toEqual(portable);
  await page.reload();
  expect(await saved(page)).toEqual(portable);
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().run.chargeVersion),
  ).toBe(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  const context = await page.context().browser().newContext();
  try {
    const target = await context.newPage();
    await target.goto("http://127.0.0.1:5173/");
    expect(await saved(target)).toBeNull();
    await target.getByRole("button", { name: "設定", exact: true }).click();
    await target.locator("#save-file").setInputFiles(path);
    await target.locator('[data-action="importrecord"]').click();
    expect(await saved(target)).toEqual(portable);
    const oldFile = `${assets}/encounter-entry-journey-weaving-1.json`,
      oldBytes = await readFile(oldFile),
      old = prepareImport(oldBytes.toString()).profile;
    expect(old.run.chargeVersion).toBeUndefined();
    await target.getByRole("button", { name: "設定", exact: true }).click();
    await target.locator("#save-file").setInputFiles(oldFile);
    await target.locator('[data-action="importrecord"]').click();
    expect(await saved(target)).toEqual(old);
    await target.reload();
    expect(await saved(target)).toEqual(old);
    await target.locator('[data-action="continue"]').click();
    const observed = await winding(target);
    expect(observed.warning).toBeNull();
    expect(
      await target.evaluate(
        () => window.__ECHO_LOOM__.game().run.chargeVersion,
      ),
    ).toBeUndefined();
    expect(await saved(target)).toEqual(old);
    await writeFile(
      `${assets}/rush-save-${info.project.name}.json`,
      JSON.stringify(
        {
          scope:
            "Fresh public current journey, genuine downloaded file, public reload/resume and independent empty-context public import. Legacy input is the actual first-room entry earned in the preceding complete native journey. No profile/Game/actor/clock injection.",
          currentVersion: 1,
          currentExportSha256: sha(bytes),
          currentProfileExact: true,
          legacySource: "encounter-entry-journey-weaving-1.json",
          legacySourceSha256: sha(oldBytes),
          legacyProfileExact: true,
          legacyWarningAbsent: true,
          legacyObserved: observed.enemy,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
});
