import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { freshProfile, SAVE_KEY } from "../src/save.js";

const label = process.argv[2] || "before";
assert.match(label, /^[a-z-]+$/);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const profile = freshProfile();
profile.attempts = 2;
await page.addInitScript(
  ({ key, profile }) => {
    if (!localStorage.getItem(key))
      localStorage.setItem(key, JSON.stringify(profile));
  },
  { key: SAVE_KEY, profile },
);
const read = () =>
  page.evaluate(async (key) => {
    const game = window.__ECHO_LOOM__.game(),
      c = document.querySelector("#world");
    const bytes = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      game: JSON.stringify(game),
      pixels: [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      png: c.toDataURL(),
      save: localStorage.getItem(key),
      echoes: structuredClone(game.echoes),
      pulses: game.hazards
        .filter((h) => h.kind === "pulse" && h.friendly)
        .map((h) => ({ ...h })),
      soundEvents: {
        echo: window.__ECHO_LOOM__.audio().last.echo,
        burst: window.__ECHO_LOOM__.audio().last.burst,
      },
    };
  }, SAVE_KEY);
async function stop(kind) {
  await page.locator('[data-action="pause"]').click();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const before = await read();
  await page.waitForTimeout(350);
  const after = await read();
  assert.deepEqual(after, before);
  await writeFile(
    `/tmp/echo-ability-${label}-${kind}.png`,
    Buffer.from(before.png.split(",")[1], "base64"),
  );
  const { png, ...record } = before;
  return { milliseconds: 350, exact: true, ...record };
}
try {
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.locator("#setting-flashes").uncheck();
  await page.locator("#setting-shake").uncheck();
  await page.locator("#setting-autoAim").check();
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
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 1,
  );
  const arrival = await stop("arrival");
  assert.ok(arrival.echoes[0].elapsed < 0.35);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() =>
    window.__ECHO_LOOM__
      .game()
      .hazards.some((h) => h.friendly && h.kind === "pulse"),
  );
  const release = await stop("release");
  assert.ok(
    release.pulses.length === 1 &&
      release.pulses[0].age < release.pulses[0].duration,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `/tmp/echo-ability-${label}.json`,
    JSON.stringify(
      {
        scope:
          "Public native keyboard first-room Q/R and 350ms pause; only prior attempts skip the introductory help. Settings are selected through the public UI. No actor, HP, history, RNG or clock preparation. Native runs are independently earned; controlled exact rendering comparisons are separate.",
        label,
        arrival,
        release,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      label,
      arrivalAge: arrival.echoes[0].elapsed,
      releaseAge: release.pulses[0].age,
      radius: release.pulses[0].r,
      pauseExact: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
