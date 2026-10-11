import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRun } from "../../src/game.js";
import { UPGRADES } from "../../src/content.js";
import {
  freshProfile,
  SAVE_KEY,
  prepareImport,
  exportProfile,
} from "../../src/save.js";
import { makeReturnRecord } from "../../src/return-record.js";

const assets = ".mdxr/20261007195700-echo-loom/assets";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const saved = (page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
async function begin(page, profile) {
  await page.addInitScript(
    ({ key, profile }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(profile));
    },
    { key: SAVE_KEY, profile },
  );
  await page.goto("/");
}
function allProfile() {
  const p = freshProfile();
  p.attempts = 2;
  p.victories = 1;
  p.unlocked.push("prism");
  Object.assign(p.settings, { shake: false, flashes: false, autoAim: true });
  p.run = createRun("RETURN-ALL", "prism");
  p.run.upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  return p;
}
async function proof(kind, engine, data) {
  await writeFile(
    `/tmp/echo-return-${kind}-${engine}.json`,
    JSON.stringify(data, null, 2) + "\n",
  );
}
async function frozen(page) {
  return page.evaluate(async (key) => {
    const g = window.__ECHO_LOOM__.game(),
      c = document.querySelector("#world");
    const bytes = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      game: JSON.stringify(g),
      save: localStorage.getItem(key),
      pixels: [...new Uint8Array(digest)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    };
  }, SAVE_KEY);
}
async function exactPause(page) {
  await page.waitForTimeout(100);
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
  return before;
}

test("帰還の全26種を読み、表示操作・再起動で保存を保ち、次の旅へ織片を渡さない", async ({
  page,
  browserName,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await begin(page, allProfile());
  await page.locator('[data-action="continue"]').click();
  await page.keyboard.down("KeyD");
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(350);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyJ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().player.invulnerable <= 0,
  );
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    g.hurt(g.run.hp, { x: g.player.x - 10, y: g.player.y });
  });
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().player.invulnerable <= 0,
  );
  await page.evaluate(() => {
    const g = window.__ECHO_LOOM__.game();
    window.__returnExpectedLastHit = {
      version: 1,
      type: "unknown",
      enemy: null,
      elite: false,
      damage: g.run.hp * (1 + g.run.difficulty * 0.15),
      hpBefore: g.run.hp,
    };
    g.hurt(g.run.hp, { x: g.player.x - 10, y: g.player.y });
  });
  await expect(
    page.getByRole("heading", { name: "灯りは、またともる" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "灯りは、またともる" }),
  ).toBeVisible();
  const keyboardFocusPath = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    keyboardFocusPath.push(
      await page.evaluate(() => ({
        tag: document.activeElement.tagName,
        className: document.activeElement.className,
      })),
    );
    if (
      await page
        .locator(".return-build > summary")
        .evaluate((el) => el === document.activeElement)
    )
      break;
  }
  await expect(page.locator(".return-build > summary")).toBeFocused();
  const completed = await saved(page),
    actual = await page.evaluate(() =>
      structuredClone(window.__ECHO_LOOM__.game().run),
    );
  expect(completed.run).toBeNull();
  expect(completed.lastReturn).toEqual(
    makeReturnRecord(
      actual,
      false,
      Math.floor(actual.kills * 0.45) + actual.memory + 5,
      await page.evaluate(() => window.__returnExpectedLastHit),
    ),
  );
  await expect(page.locator(".return-light")).toContainText("逆再生");
  const summary = page.locator(".return-build > summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".return-build")).toHaveAttribute("open", "");
  await expect(page.locator("[data-return-fragment]")).toHaveCount(26);
  await expect(page.locator('[data-return-fragment="rewind"]')).toContainText(
    "折り返す昨日",
  );
  const paused = await exactPause(page);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".return-build")).not.toHaveAttribute("open", "");
  await page.locator(".return-performance > summary").click();
  await expect(page.locator(".return-performance")).toContainText("受けた被害");
  expect(await frozen(page)).toEqual(paused);
  await page.screenshot({ path: `/tmp/echo-return-defeat-${browserName}.png` });
  await page.getByRole("button", { name: "灯台へ帰る", exact: true }).click();
  await page.getByRole("button", { name: "直近の旅", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("硝子針");
  expect((await saved(page)).lastReturn).toEqual(completed.lastReturn);
  await page.keyboard.press("Escape");
  await page.reload();
  expect((await saved(page)).lastReturn).toEqual(completed.lastReturn);
  await page.getByRole("button", { name: "直近の旅", exact: true }).click();
  await page.locator('[data-action="returnagain"]').click();
  await expect(
    page.locator('[data-action="weapon"][data-id="prism"]'),
  ).toHaveClass(/selected/);
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  const next = await page.evaluate(() =>
    structuredClone(window.__ECHO_LOOM__.game().run),
  );
  expect(next.weapon).toBe("prism");
  expect(next.upgrades).toEqual({});
  expect((await saved(page)).lastReturn).toEqual(completed.lastReturn);
  expect(errors).toEqual([]);
  await proof("defeat", browserName, {
    scope:
      "Prepared all-upgrade entry; actual native movement/fire then two controlled hurt calls (consume the equipped shield, wait its native invulnerability, finish) for return integration. This is not a natural defeat or win-rate sample. Keyboard details, frozen game/RGBA/save, home/reload/book and public next-run start. No old upgrades are applied to the new run.",
    actual,
    completed,
    keyboardFocusPath,
    paused,
    next,
    errors,
  });
});

test("公開の書き出し・取り込み・取り消しでも直近の旅と途中の旧航路を別々に保つ", async ({
  page,
  browserName,
}) => {
  const errors = [],
    dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  const data = JSON.parse(
    await readFile(
      new URL("../fixtures/return-run.json", import.meta.url),
      "utf8",
    ),
  );
  const p = freshProfile();
  p.attempts = 2;
  p.victories = 1;
  p.lastReturn = makeReturnRecord(data.run, true, 133);
  p.lastReturn.run.seed = "</p><img src=x onerror=alert(1)>";
  p.run = createRun("RETURN-ONGOING");
  p.run.catalogVersion = 2;
  await begin(page, p);
  const initial = await saved(page);
  await page.getByRole("button", { name: "直近の旅", exact: true }).click();
  await page.locator(".return-performance > summary").click();
  await expect(page.locator(".return-route")).toContainText(
    p.lastReturn.run.seed,
  );
  await expect(page.locator(".return-route img")).toHaveCount(0);
  expect(await saved(page)).toEqual(initial);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "記録を書き出す", exact: true })
    .click();
  const exported = prepareImport(
    await readFile(await (await pending).path(), "utf8"),
  ).profile;
  expect(exported.lastReturn).toEqual(p.lastReturn);
  const incoming = freshProfile();
  incoming.lastReturn = makeReturnRecord(
    createRun("RETURN-IMPORTED"),
    false,
    5,
  );
  await page.locator("#save-file").setInputFiles({
    name: "return-profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportProfile(incoming)),
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.getByRole("button", { name: "直近の旅", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("0種 · 合計0段");
  expect((await saved(page)).lastReturn).toEqual(incoming.lastReturn);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page
    .getByRole("button", { name: "直前の取り込みを戻す", exact: true })
    .click();
  await page
    .getByRole("button", { name: "この記録へ戻す", exact: true })
    .click();
  const undone = await saved(page);
  expect(undone.lastReturn).toEqual(p.lastReturn);
  expect(undone.run.catalogVersion).toBe(2);
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  expect(
    await page.evaluate(() => window.__ECHO_LOOM__.game().run.catalogVersion),
  ).toBe(2);
  expect((await saved(page)).lastReturn).toEqual(p.lastReturn);
  expect(errors).toEqual([]);
  expect(dialogs).toEqual([]);
  await proof("files", browserName, {
    scope:
      "Prepared saved return and unrelated old catalog 2 entry. Public book/export/import/undo/reload/continue; HTML-like seed remains plain text. No actor or combat mutation.",
    exported,
    undone,
    errors,
    dialogs,
  });
});

test("取り込んだ旅の装備・潮の深さは工房や勝利の解放条件を飛ばさない", async ({
  page,
  browserName,
}) => {
  const cases = [
    {
      weapon: "prism",
      relic: "spool",
      difficulty: 0,
      unlocked: ["needle", "spool"],
      victories: 0,
    },
    {
      weapon: "needle",
      relic: "ember",
      difficulty: 0,
      unlocked: ["needle", "spool"],
      victories: 0,
    },
    {
      weapon: "needle",
      relic: "spool",
      difficulty: 2,
      unlocked: ["needle", "spool"],
      victories: 0,
    },
    {
      weapon: "prism",
      relic: "ember",
      difficulty: 2,
      unlocked: ["needle", "spool", "prism", "ember"],
      victories: 1,
    },
  ];
  const observations = [];
  await page.goto("/");
  for (const [index, c] of cases.entries()) {
    const p = freshProfile();
    p.unlocked = c.unlocked;
    p.victories = c.victories;
    const run = createRun("RETURN-LOCKS", c.weapon, c.relic, c.difficulty);
    p.lastReturn = makeReturnRecord(run, false, 5);
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.locator("#save-file").setInputFiles({
      name: "locks.json",
      mimeType: "application/json",
      buffer: Buffer.from(exportProfile(p)),
    });
    await page
      .getByRole("button", { name: "記録を取り込む", exact: true })
      .click();
    const before = await saved(page);
    await page.getByRole("button", { name: "直近の旅", exact: true }).click();
    const next = page.locator('[data-action="returnagain"]');
    if (index < 3) {
      await expect(next).toBeDisabled();
      await page.evaluate(() =>
        document
          .querySelector('[data-action="returnagain"]')
          .dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
      await expect(
        page.getByRole("heading", { name: "直近の旅", exact: true }),
      ).toBeVisible();
      expect(await saved(page)).toEqual(before);
      await page.keyboard.press("Escape");
    } else {
      await expect(next).toBeEnabled();
      await next.click();
      for (const [kind, value] of [
        ["weapon", c.weapon],
        ["relic", c.relic],
        ["difficulty", String(c.difficulty)],
      ])
        await expect(
          page.locator(`[data-action="${kind}"][data-id="${value}"]`),
        ).toHaveClass(/selected/);
      expect(await saved(page)).toEqual(before);
      await page.keyboard.press("Escape");
    }
    observations.push({ ...c, savedUnchanged: true, allowed: index === 3 });
  }
  await proof("locks", browserName, {
    scope:
      "Public imports of four prepared read-only returns. Actual disabled buttons plus synthetic dispatch exercise the handler guard; unlocked loadout selects only its setup. No actor/combat changes or meta grants.",
    observations,
  });
});

test.describe("小画面の直近の旅", () => {
  test.use({ hasTouch: true });
  test("三サイズで全織片を開いて最後まで読み、実タップで戻り保存を保つ", async ({
    page,
    browserName,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const p = allProfile();
    p.lastReturn = makeReturnRecord(p.run, false, 5);
    p.run = null;
    await begin(page, p);
    const before = await saved(page);
    const sizes = [];
    for (const viewport of [
      { width: 640, height: 360 },
      { width: 390, height: 844 },
      { width: 360, height: 640 },
    ]) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: "直近の旅", exact: true }).tap();
      await page.locator(".return-build > summary").tap();
      await expect(page.locator(".return-build")).toHaveAttribute("open", "");
      const last = page.locator('[data-return-fragment="rewind"]');
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      const layout = await page.evaluate(() => {
        const names = [
          ...document.querySelectorAll(
            ".return-fragment h3,.return-fragment p,.return-overview summary",
          ),
        ];
        const primary = document.querySelector('[data-action="returnagain"]'),
          r = primary.getBoundingClientRect();
        return {
          noOverflow:
            document.documentElement.scrollWidth <= innerWidth &&
            names.every((e) => e.scrollWidth <= e.clientWidth + 1),
          minFont: Math.min(
            ...names.map((e) => parseFloat(getComputedStyle(e).fontSize)),
          ),
          primaryHit:
            document
              .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
              ?.closest("button") === primary,
          primaryHeight: r.height,
          fragmentCount: document.querySelectorAll("[data-return-fragment]")
            .length,
        };
      });
      expect(layout.noOverflow).toBe(true);
      expect(layout.minFont).toBeGreaterThanOrEqual(10);
      expect(layout.primaryHit).toBe(true);
      expect(layout.primaryHeight).toBeGreaterThanOrEqual(40);
      expect(layout.fragmentCount).toBe(26);
      expect(await saved(page)).toEqual(before);
      await page.screenshot({
        path: `/tmp/echo-return-touch-${browserName}-${viewport.width}x${viewport.height}.png`,
      });
      sizes.push({ viewport, ...layout });
      await page.getByRole("button", { name: "灯台へ戻る", exact: true }).tap();
    }
    expect(errors).toEqual([]);
    await proof("touch", browserName, {
      scope:
        "Prepared read-only return only, no ongoing game. Actual touch-context taps/scrolling of all 26 fragments and fixed primary button at three sizes. Save remains exact; not physical-device evidence.",
      sizes,
      errors,
    });
  });
});

test("実戦で得た最終入口を通常キーで勝利し、直近の旅へ実際の能力と戦闘回数を保存する", async ({
  page,
  browserName,
}) => {
  const bytes = await readFile(
      `${assets}/memory-ward-arrival-needle-stitch-weaving.json`,
    ),
    initial = prepareImport(bytes.toString()).profile;
  const errors = [],
    held = new Set(),
    inputs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#save-file").setInputFiles({
    name: "earned-last-room.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "記録を取り込む", exact: true })
    .click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-autoAim").check();
  await page.locator("#setting-flashes").uncheck();
  await page.locator("#setting-shake").uncheck();
  await page.getByRole("button", { name: "設定を閉じる", exact: true }).click();
  await page.locator('[data-action="continue"]').click();
  const keys = async (wanted) => {
    for (const k of held)
      if (!wanted.includes(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
    for (const k of wanted)
      if (!held.has(k)) {
        await page.keyboard.down(k);
        held.add(k);
      }
  };
  const started = Date.now();
  let actual;
  for (let step = 0; step < 560; step++) {
    const s = await page.evaluate(() => ({
      mode: window.__ECHO_LOOM__.game().mode,
      screen: window.__ECHO_LOOM__.snapshot().screen,
      run: structuredClone(window.__ECHO_LOOM__.game().run),
    }));
    if (s.screen === "victory") {
      actual = s.run;
      break;
    }
    expect(s.mode).not.toBe("dead");
    const seconds = (Date.now() - started) / 1000,
      angle = seconds * 0.6,
      wanted = ["KeyJ"];
    if (Math.cos(angle) > 0.25) wanted.push("KeyD");
    if (Math.cos(angle) < -0.25) wanted.push("KeyA");
    if (Math.sin(angle) > 0.25) wanted.push("KeyS");
    if (Math.sin(angle) < -0.25) wanted.push("KeyW");
    await keys(wanted);
    if (step % 8 === 4) await page.keyboard.press("KeyQ");
    if (step % 16 === 8) await page.keyboard.press("Space");
    if (step % 16 === 0) await page.keyboard.press("KeyR");
    if (step % 16 === 0)
      inputs.push({
        step,
        seconds,
        hp: s.run.hp,
        kills: s.run.kills,
        keys: wanted,
      });
    await page.waitForTimeout(100);
  }
  expect(actual).toBeDefined();
  await keys([]);
  await expect(page.getByRole("heading", { name: "明日の灯り" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "明日の灯り" })).toBeVisible();
  const completed = await saved(page),
    reward = Math.floor(actual.kills * 0.45) + 16 + actual.memory + 35;
  expect(completed.lastReturn).toEqual(makeReturnRecord(actual, true, reward));
  expect(completed.run).toBeNull();
  expect(completed.victories).toBe(initial.victories + 1);
  await page.locator(".return-build > summary").click();
  expect(await page.locator("[data-return-fragment]").count()).toBe(
    Object.values(completed.lastReturn.run.upgrades).filter(Boolean).length,
  );
  const paused = await exactPause(page);
  await page.screenshot({
    path: `/tmp/echo-return-victory-${browserName}.png`,
  });
  await page.getByRole("button", { name: "灯台へ帰る", exact: true }).click();
  await page.reload();
  expect((await saved(page)).lastReturn).toEqual(completed.lastReturn);
  await page.getByRole("button", { name: "直近の旅", exact: true }).click();
  await page.locator(".return-performance > summary").click();
  await expect(page.getByRole("dialog")).toContainText(`合わせ縫い`);
  expect(await saved(page)).toEqual(completed);
  expect(errors).toEqual([]);
  await proof("earned", browserName, {
    scope:
      "Unchanged final-room entry earned by the earlier complete native needle weaving expedition. Public import and aim/flash/shake preferences, then only real direction/J/Q/R/Space, actual victory, read-only return/details, home/reload/book. No actor/HP/position/RNG/history/clock preparation. Not a fresh complete expedition.",
    sourceSha256: sha(bytes),
    actual,
    completed,
    inputs,
    paused,
    wallSeconds: (Date.now() - started) / 1000,
    errors,
  });
});
