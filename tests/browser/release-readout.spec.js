import { fixturePath } from "./artifacts.js";
import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SAVE_KEY, prepareImport } from "../../src/save.js";

const source = "encounter-entry-shell-voyage-9.json";

async function start(page) {
  const bytes = await readFile(fixturePath(source));
  const earned = prepareImport(bytes.toString()).profile;
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: source,
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.locator('[data-action="importrecord"]').click();
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY),
  ).toEqual(earned);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-flashes").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  const initial = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    SAVE_KEY,
  );
  await page.locator('[data-action="continue"]').click();
  await page.waitForFunction(
    () =>
      window.__ECHO_LOOM__.game().history.length >= 120 &&
      document.querySelectorAll(".toast").length === 0,
  );
  return { bytes, initial };
}
const freeze = (page) =>
  page.evaluate(
    (k) => ({
      game: JSON.stringify(window.__ECHO_LOOM__.game()),
      pixels: document.querySelector("#world").toDataURL(),
      body: document.body.innerText,
      save: localStorage.getItem(k),
    }),
    SAVE_KEY,
  );
async function positive(page) {
  await page.waitForFunction(
    () => {
      const node = document.querySelector("#release-targets");
      return (
        (!node.hidden && /影 [1-9]/.test(node.textContent)) ||
        (!node.hidden && /弾 [1-9]/.test(node.textContent))
      );
    },
    {},
    { timeout: 15000 },
  );
}

test("本物の庭で解放の届く先を読み、自然な変化・停止・四画面・実ファイルを保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { bytes, initial } = await start(page);
  await expect(page.locator("#release-targets")).toBeHidden();
  await page.evaluate(() => {
    window.__REACH_READ__ = [];
    let lastSignature = null;
    new MutationObserver(() => {
      const node = document.querySelector("#release-targets");
      const g = window.__ECHO_LOOM__.game();
      if (!node || !g) return;
      const signature = `${node.hidden}|${node.textContent}|${node.getAttribute("aria-label")}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      if (window.__REACH_READ__.length >= 120) return;
      const r = g.stats.burstRadius;
      const reaches = (o, extra) =>
        g.echoes.some((e) => Math.hypot(o.x - e.x, o.y - e.y) < r + extra);
      const active =
        ["combat", "cleared"].includes(g.mode) && g.echoes.length > 0;
      const enemies = active
        ? g.enemies.filter((e) => e.hp > 0 && reaches(e, e.r)).length
        : 0;
      const bullets = active
        ? g.bullets.filter((b) => !b.friendly && b.life > 0 && reaches(b, 0))
            .length
        : 0;
      window.__REACH_READ__.push({
        time: g.t,
        enemies,
        bullets,
        active,
        hidden: node.hidden,
        text: node.textContent,
        description: node.getAttribute("aria-label"),
        rng: g.rng.state,
      });
    }).observe(document.querySelector("#interface"), {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await page.keyboard.press("KeyQ", { delay: 50 });
  await positive(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const before = await freeze(page);
  await page.waitForTimeout(350);
  expect(await freeze(page)).toEqual(before);
  await page.screenshot({
    path: `${assets}/reach-after-${info.project.name}.png`,
  });
  const displays = [];
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 640, height: 360 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    expect((await freeze(page)).pixels).toBe(before.pixels);
    const rect = await page.locator("#release-targets").evaluate((el) => {
      const r = el.getBoundingClientRect(),
        d = el.closest(".action-dock").getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        dock: d.toJSON(),
      };
    });
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(size.width);
    expect(rect.y).toBeGreaterThanOrEqual(rect.dock.top);
    expect(rect.bottom).toBeLessThanOrEqual(rect.dock.bottom);
    displays.push({ size, rect });
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.press("KeyR", { delay: 50 });
  await expect(page.locator("#release-targets")).toBeHidden();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().echoes.length),
  ).toBe(0);
  const samples = await page.evaluate(() => window.__REACH_READ__);
  expect(samples.length).toBeGreaterThanOrEqual(2);
  for (const s of samples) {
    expect(s.hidden).toBe(!s.active);
    expect(s.text).toBe(s.active ? `影 ${s.enemies} / 弾 ${s.bullets}` : "");
    expect(s.description).toBe(
      `解放の爆発が届く影 ${s.enemies}体、消せる敵弾 ${s.bullets}発`,
    );
  }
  expect(samples.some((s) => s.enemies > 0 || s.bullets > 0)).toBe(true);
  expect(samples.some((s) => !s.active)).toBe(true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  expect(JSON.parse((await freeze(page)).save)).toEqual(initial);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const exported = await readFile(await (await pending).path());
  expect(prepareImport(exported.toString()).profile).toEqual(initial);
  await writeFile(`${assets}/reach-export-${info.project.name}.json`, exported);
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "灯台へ戻る", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "actual-reach.json",
    mimeType: "application/json",
    buffer: exported,
  });
  await page.locator('[data-action="importrecord"]').click();
  await page.reload();
  expect(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY),
  ).toEqual(initial);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/reach-native-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Public reentry of the genuine garden earned in SHELL-VOYAGE. Native Q/R, read-only MutationObserver snapshots of naturally changing targets, whole 350ms Game/PNG/body/raw-save freeze, four CSS displays and actual export/public home import/reload. No live Game/profile/actor/health/clock/RNG injection. Not a fresh expedition or human playtest.",
        sourceArtifact: source,
        sourceSha256: createHash("sha256").update(bytes).digest("hex"),
        samples,
        displays,
        fullFreezeExact: true,
        wholeProfileExact: true,
        exportImportReloadExact: true,
        exportSha256: createHash("sha256").update(exported).digest("hex"),
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("三エンジンの384解放で表示の受け手と実際の減った体力・消えた敵弾を照合", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { Game, createRun } = await import("/src/game.js"),
      { releaseReadout } = await import("/src/release-readout.js");
    const rows = [];
    const saved = JSON.stringify(localStorage);
    for (let rank = 0; rank < 4; rank++)
      for (let count = 1; count <= 3; count++)
        for (let dir = 0; dir < 16; dir++)
          for (const version of [0, 1]) {
            const run = createRun("REACH-PREPARED");
            if (!version) delete run.chargeVersion;
            run.upgrades.burst = rank;
            run.upgrades.double = count - 1;
            const g = new Game(run);
            g.enemies = [];
            g.bullets = [];
            g.hazards = [];
            g.echoes = Array.from({ length: count }, (_, i) => ({
              x: 160 + i * 7,
              y: 130 + i * 11,
              r: 5,
              angle: 0,
              frames: [],
              frame: -1,
              elapsed: 0,
              returnStock: 0,
            }));
            const c = g.echoes[0],
              a = (dir * Math.PI) / 8,
              targets = [],
              bullets = [];
            for (const offset of [-2, -1e-6, 0, 1e-6, 2]) {
              const e = g.spawn("shield", 240, 150);
              e.hp = e.maxHp = 2000;
              const d = g.stats.burstRadius + e.r + offset;
              e.x = c.x + Math.cos(a) * d;
              e.y = c.y + Math.sin(a) * d;
              targets.push(e);
              const r = g.stats.burstRadius + offset,
                b = g.makeBullet(c, a, 10, 0, false, "#fff");
              b.x = c.x + Math.cos(a) * r;
              b.y = c.y + Math.sin(a) * r;
              bullets.push(b);
            }
            const state = JSON.stringify(g),
              rng = g.rng.state,
              read = releaseReadout(g),
              pure = state === JSON.stringify(g) && rng === g.rng.state;
            g.release();
            rows.push({
              rank,
              count,
              dir,
              version,
              enemies: read.enemies,
              actualEnemies: targets.filter((e) => e.hp < 2000).length,
              bullets: read.bullets,
              actualBullets: bullets.filter((b) => b.life === 0).length,
              pure,
            });
          }
    return {
      configurations: rows.length,
      rows,
      storageExact: saved === JSON.stringify(localStorage),
    };
  });
  expect(result.configurations).toBe(384);
  expect(result.storageExact).toBe(true);
  for (const r of result.rows) {
    expect(r.pure).toBe(true);
    expect(r.enemies).toBe(r.actualEnemies);
    expect(r.bullets).toBe(r.actualBullets);
  }
  await writeFile(
    `${assets}/reach-simulation-${browserName}.json`,
    JSON.stringify(
      {
        scope:
          "Prepared detached actual Games, strict boundary placements after the real emitter offset, four radius ranks, one to three overlapping echoes, sixteen directions, current and legacy charge versions. Actual release HP/life changes match the recipient readout; these are not public battles.",
        ...result,
      },
      null,
      2,
    ) + "\n",
  );
});

test("タッチの解放で届く先を読み、寿命・蓄え・操作の間隔を保つ", async ({
  browser,
  browserName,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    hasTouch: true,
    ...(browserName === "firefox" ? {} : { isMobile: true }),
  });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await start(page);
    await page.locator('[data-touch-action="echo"]').tap();
    await positive(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const first = await freeze(page);
    await page.waitForTimeout(350);
    expect(await freeze(page)).toEqual(first);
    const layout = await page.evaluate(() => {
      const r = (s) =>
        document.querySelector(s).getBoundingClientRect().toJSON();
      return {
        target: r("#release-targets"),
        life: r("#echo-life-status"),
        dock: r(".action-dock"),
        touch: r(".touch-actions"),
      };
    });
    expect(layout.target.bottom).toBeLessThanOrEqual(layout.life.top);
    expect(layout.touch.bottom).toBeLessThanOrEqual(layout.dock.top);
    await page.screenshot({
      path: `${assets}/reach-touch-${info.project.name}.png`,
    });
    await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
    await page.locator('[data-touch-action="burst"]').tap();
    await expect(page.locator("#release-targets")).toBeHidden();
    expect(errors).toEqual([]);
    await writeFile(
      `${assets}/reach-touch-${info.project.name}.json`,
      JSON.stringify(
        {
          scope:
            "Touch-native public reentry of the actually earned garden, Q/R buttons, real naturally approaching threats, full freeze and actual non-overlap geometry. No live battle edits; not a physical device test.",
          layout,
          fullFreezeExact: true,
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
