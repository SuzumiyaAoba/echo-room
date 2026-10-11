import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { freshProfile, SAVE_KEY } from "../src/save.js";

const label = process.argv[2] || "before";
assert.match(label, /^[a-z-]+$/);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const profile = freshProfile();
profile.attempts = 2;
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(
  ({ key, profile }) => {
    if (!localStorage.getItem(key))
      localStorage.setItem(key, JSON.stringify(profile));
  },
  { key: SAVE_KEY, profile },
);
const read = () =>
  page.evaluate(async (key) => {
    const g = window.__ECHO_LOOM__.game();
    const c = document.querySelector("#world");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
    );
    return {
      game: JSON.stringify(g),
      pixels: [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      png: c.toDataURL(),
      save: localStorage.getItem(key),
      history: structuredClone(g.history),
      echoes: structuredClone(g.echoes),
      next: document.querySelector("#echo-next").textContent,
    };
  }, SAVE_KEY);
async function pause(kind) {
  await page.locator('[data-action="pause"]').click();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForTimeout(120);
  const before = await read();
  await page.waitForTimeout(350);
  assert.deepEqual(await read(), before);
  await writeFile(
    `/tmp/echo-recording-${label}-${kind}.png`,
    Buffer.from(before.png.split(",")[1], "base64"),
  );
  const { png, ...rest } = before;
  return { milliseconds: 350, exact: true, ...rest };
}
try {
  await page.goto("http://127.0.0.1:5173/");
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
  const recording = await pause("route");
  assert.ok(recording.history.length >= 24);
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.press("KeyQ");
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game().echoes.length === 1,
  );
  const called = await pause("called");
  assert.deepEqual(errors, []);
  await writeFile(
    `/tmp/echo-recording-${label}.json`,
    JSON.stringify(
      {
        scope:
          "Public first-room native movement/fire/Q and 350ms pauses. Only attempts skip introduction; settings selected through public UI. No actor, HP, history, RNG or clock preparation. Before/after observations are independently earned runs; fixed rendering comparisons are separate.",
        recording,
        called,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      label,
      frames: recording.history.length,
      shots: recording.history.filter((f) => f.fire).length,
      first: recording.history[0],
      last: recording.history.at(-1),
      pauseExact: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
