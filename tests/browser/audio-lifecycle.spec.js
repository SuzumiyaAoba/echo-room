import { artifacts as assets } from "./artifacts.js";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test.use({ hasTouch: true });

const sample = (page) =>
  page.evaluate(() => {
    const a = window.__ECHO_LOOM__.audio();
    return {
      state: a.ctx.state,
      time: a.ctx.currentTime,
      step: a.step,
      voices: a.voices.size,
      active: a.playbackActive,
      pending: !!a.pendingSuspend,
    };
  });
const frozen = (page) =>
  page.evaluate(() => ({
    game: JSON.stringify(window.__ECHO_LOOM__.game()),
    pixels: document.querySelector("#world").toDataURL(),
    save: localStorage.getItem("echo-loom.save.v1"),
    body: document.body.innerText,
  }));
const world = ({ game, pixels, save }) => ({ game, pixels, save });
async function start(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "灯りの練習", exact: true }).click();
  await expect.poll(() => sample(page).then((r) => r.state)).toBe("running");
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "灯りをひと休み" }),
  ).toBeVisible();
  await page.waitForTimeout(150);
}
async function advances(page) {
  const before = await sample(page);
  await expect
    .poll(() => sample(page).then((r) => r.time))
    .toBeGreaterThan(before.time + 0.1);
  await expect
    .poll(() => sample(page).then((r) => r.step))
    .toBeGreaterThan(before.step);
  return { before, after: await sample(page) };
}
async function exactPause(page) {
  await page.waitForTimeout(150);
  const before = await frozen(page);
  await page.waitForTimeout(350);
  expect(await frozen(page)).toEqual(before);
}

test("実音声APIで短い停止と再開を繰り返し、音の時計と停止中の全世界を保つ", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const original = await frozen(page),
    rows = [];
  for (let i = 0; i < 6; i++) {
    const immediate = await page.evaluate(async () => {
      const a = window.__ECHO_LOOM__.audio();
      const stopping = a.suspend(),
        stateAfterStop = a.ctx.state,
        starting = a.start();
      await Promise.all([stopping, starting]);
      return {
        stateAfterStop,
        settled: a.ctx.state,
        active: a.playbackActive,
        pending: !!a.pendingSuspend,
      };
    });
    expect(immediate.settled).toBe("running");
    expect(immediate.active).toBe(true);
    expect(immediate.pending).toBe(false);
    const progress = await advances(page);
    await exactPause(page);
    expect(await frozen(page)).toEqual(original);
    rows.push({ immediate, progress });
  }
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/audio-life-rapid-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Six prepared audio-only rapid stop/start cycles through the product AudioEngine and real default native AudioContext, read-only DEV diagnostics. Public fresh practice and pause; no profile/actor/clock/RNG/context-state overrides. Whole Game/PNG/body/raw save stay exact. Not a physical interruption test.",
        rows,
        fullPausedWorldAndSaveExact: true,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("本当のキーとタップで音を再開し、音量と停止した旅を保持する", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const original = world(await frozen(page)),
    rows = [];
  for (const gesture of ["keyboard", "pointer"]) {
    await page.evaluate(() => window.__ECHO_LOOM__.audio().ctx.suspend());
    expect((await sample(page)).state).toBe("suspended");
    if (gesture === "keyboard") await page.keyboard.press("KeyD");
    else await page.getByRole("heading", { name: "灯りをひと休み" }).tap();
    await expect.poll(() => sample(page).then((r) => r.state)).toBe("running");
    rows.push({ gesture, ...(await advances(page)) });
    await exactPause(page);
    expect(world(await frozen(page))).toEqual(original);
  }
  await page.getByRole("button", { name: "練習を終える", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#music-volume").fill("0");
  await page.locator("#effects-volume").fill("0");
  await expect
    .poll(() => sample(page).then((r) => r.voices), { timeout: 6000 })
    .toBe(0);
  await page.locator("#music-volume").fill("0.35");
  await expect
    .poll(() => sample(page).then((r) => r.voices))
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `${assets}/audio-life-settings-${info.project.name}.png`,
  });
  await writeFile(
    `${assets}/audio-life-gesture-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Public fresh practice/pause, real native AudioContext.suspend to prepare a temporarily quiet context, then trusted keyboard D and a real touch tap on the pause heading restore it. No simulated audio clock/state/profile/actor/RNG. Whole Game/PNG/raw save preserved across input modes; complete Game/PNG/body/raw-save freeze within each mode. Actual public volume sliders mute and restore native voices. Not a physical hardware interruption test.",
        rows,
        wholePausedWorldAndRawSaveAcrossGesturesExact: true,
        full350msFreezeExact: true,
        nativeMuteAndRestore: true,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});

test("準備した可視状態の急な往復でも最後の停止を保ち、次の実操作で復帰できる", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const original = await frozen(page);
  await page.evaluate(() => {
    window.__audioHidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => window.__audioHidden,
    });
    for (const hidden of [true, false, true, false, true]) {
      window.__audioHidden = hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  await expect.poll(() => sample(page).then((r) => r.state)).toBe("suspended");
  expect((await sample(page)).active).toBe(false);
  await page.keyboard.press("KeyD");
  expect((await sample(page)).state).toBe("suspended");
  const stopped = await sample(page);
  await page.waitForTimeout(350);
  expect((await sample(page)).time).toBe(stopped.time);
  expect(await frozen(page)).toEqual(original);
  await page.evaluate(() => {
    window.__audioHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
    delete window.__audioHidden;
  });
  await expect.poll(() => sample(page).then((r) => r.state)).toBe("running");
  const restored = await advances(page);
  await exactPause(page);
  expect(await frozen(page)).toEqual(original);
  expect(errors).toEqual([]);
  await writeFile(
    `${assets}/audio-life-visibility-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "Prepared document.hidden values and real visibilitychange event handlers, public fresh practice/pause, actual native AudioContext operations. Final hidden request wins over pending resumes; hidden keyboard cannot restart audio. No native audio clock/state, actor/profile/RNG override. Whole Game/PNG/body/raw save are exact. This prepared visibility simulation is not a real browser-background or phone interruption test.",
        transitions: [true, false, true, false, true],
        stopped,
        restored,
        latestHiddenWins: true,
        hiddenGestureDoesNotResume: true,
        fullPausedWorldAndSaveExact: true,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
});
