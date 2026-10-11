import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { SAVE_KEY } from "../src/save.js";
import { weavingChoiceProfile } from "../tests/fixtures/upgrade-preview.js";

const destination = ".mdxr/20261007195700-echo-loom/assets";
const report = {
  scope:
    "Previous production build before the upgrade-effect comparison UI. Actual public continue screen from an explicitly prepared saved-reward fixture, not an organically earned run. Read-only display observations, desktop and 640x360 viewport.",
  cases: [],
};
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1200, height: 850 },
    small: { width: 640, height: 360 },
  })) {
    const context = await browser.newContext({
      viewport,
      storageState: {
        cookies: [],
        origins: [
          {
            origin: "http://127.0.0.1:4173",
            localStorage: [
              { name: SAVE_KEY, value: JSON.stringify(weavingChoiceProfile()) },
            ],
          },
        ],
      },
    });
    try {
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:4173/");
      await page.locator('[data-action="continue"]').click();
      const ids = await page
        .locator('[data-action="upgrade"]')
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
      assert.deepEqual(
        [...ids].sort(),
        ["counter", "quickecho", "refund"].sort(),
      );
      assert.equal(await page.locator(".upgrade-comparison").count(), 0);
      await page.screenshot({
        path: `${destination}/upgrade-choice-before-${name}.png`,
      });
      const state = await page.evaluate(
        (key) => ({
          scripts: [...document.scripts].map((s) => s.src).filter(Boolean),
          run: JSON.parse(localStorage.getItem(key)).run,
        }),
        SAVE_KEY,
      );
      report.cases.push({ name, viewport, ids, ...state, errors });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  await writeFile(
    `${destination}/upgrade-choice-before.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      report.cases.map(({ name, ids, scripts, errors }) => ({
        name,
        ids,
        scripts,
        errors,
      })),
    ),
  );
} finally {
  await browser.close();
}
