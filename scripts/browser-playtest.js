import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173");
await page.getByRole("button", { name: "灯りをともす" }).click();
await page.locator("#seed").fill("LIVE-COMBAT");
await page.getByRole("button", { name: "この灯りで出発する" }).click();
await page.getByRole("button", { name: "最初のひと針へ" }).click();
await page.keyboard.down("KeyJ");
const inputs = ["KeyD", "KeyW", "KeyA", "KeyS", "KeyD", "KeyW", "KeyA", "KeyS"];
const observations = [];
for (let i = 0; i < inputs.length; i++) {
  await page.keyboard.down(inputs[i]);
  await page.keyboard.press("Space");
  if (i % 3 === 1) await page.keyboard.press("KeyQ");
  if (i % 3 === 0 && i > 0) await page.keyboard.press("KeyR");
  await page.waitForTimeout(1800);
  await page.keyboard.up(inputs[i]);
  observations.push(await page.evaluate(() => window.__ECHO_LOOM__.snapshot()));
  if (i === 2)
    await page.screenshot({
      path: ".mdxr/20261007195700-echo-loom/assets/live-combat.png",
    });
  if (observations.at(-1).screen !== "play") break;
}
await page.keyboard.up("KeyJ");
await page.screenshot({
  path: ".mdxr/20261007195700-echo-loom/assets/live-final.png",
});
console.log(
  JSON.stringify(
    {
      errors,
      observations: observations.map((o) => ({
        screen: o.screen,
        hp: o.run.hp,
        kills: o.run.kills,
        echoes: o.echoes,
        enemies: o.enemies,
        time: o.run.time,
      })),
    },
    null,
    2,
  ),
);
await browser.close();
