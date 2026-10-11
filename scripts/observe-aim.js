import { developmentURL } from "./browser-url.js";
import { observationDirectory } from "./observation-files.js";
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { freshProfile, SAVE_KEY } from "../src/save.js";

const label = process.argv[2] || "before";
const root = observationDirectory;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const profile = freshProfile();
  // Skip the first-attempt introduction; the route itself is created by the UI.
  profile.attempts = 2;
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: SAVE_KEY, value: profile },
  );
  await page.goto(developmentURL);
  await page.getByRole("button", { name: "灯りをともす" }).click();
  await page.locator("#seed").fill("AIM-AFTER-PAUSE");
  await page.getByRole("button", { name: "この灯りで出発する" }).click();
  await page.waitForFunction(
    () => window.__ECHO_LOOM__.game()?.enemies.length > 0,
  );
  const point = { x: 80, y: 260 };
  const box = await page.locator("#world").boundingBox();
  const client = {
    x: box.x + (point.x * box.width) / 480,
    y: box.y + (point.y * box.height) / 300,
  };
  const target = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.id,
    client,
  );
  if (target !== "world") throw new Error(`Pointer target: ${target}`);
  await page.mouse.move(client.x, client.y);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "航路へ戻る", exact: true }).click();
  await page.keyboard.down("KeyJ");
  const handle = await page.waitForFunction((point) => {
    const game = window.__ECHO_LOOM__.game();
    const bullets = game.bullets.filter((bullet) => bullet.friendly);
    if (!bullets.length || !game.enemies.length) return false;
    const player = {
      x: game.player.x,
      y: game.player.y,
      angle: game.player.angle,
    };
    const nearest = game.enemies.reduce((a, b) =>
      Math.hypot(a.x - player.x, a.y - player.y) <
      Math.hypot(b.x - player.x, b.y - player.y)
        ? a
        : b,
    );
    const mouseAngle = Math.atan2(point.y - player.y, point.x - player.x);
    const nearestAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
    const difference = (a, b) =>
      Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    return {
      player,
      nearest: { kind: nearest.kind, x: nearest.x, y: nearest.y },
      mouseAngle,
      nearestAngle,
      distanceFromMouseAngle: difference(player.angle, mouseAngle),
      distanceFromNearestAngle: difference(player.angle, nearestAngle),
      bullets: bullets.map(({ angle, x, y }) => ({ angle, x, y })),
      run: game.run,
    };
  }, point);
  const actual = await handle.jsonValue();
  await page.keyboard.up("KeyJ");
  await page.screenshot({ path: `${root}/aim-${label}.png` });
  const result = {
    scope:
      "Public start of a new route, natural first enemies, native mouse aim then pause/resume and keyboard firing. Only prior attempt count is prepared to skip the introduction; no actor, HP, clock or combat state writes.",
    point,
    target,
    actual,
    errors,
  };
  await writeFile(
    `${root}/aim-${label}.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
