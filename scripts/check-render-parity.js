import { chromium, firefox, webkit } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const baseline = process.argv[2] === "baseline";
const spritesOnly = process.argv.includes("sprites");
const destination = ".mdxr/20261007195700-echo-loom/assets";
const report = {
  scope: spritesOnly
    ? "Native Canvas actor pixels for direction, walking, palette and fractional scale, compared with the pre-cache actor baseline. Room scenery intentionally changed and is reviewed separately."
    : "Native Canvas pixels for sprite direction, walking, palette and fractional scale; static rooms across all regions, bosses and closed/open exits.",
  browsers: {},
};
const reference = baseline
  ? null
  : JSON.parse(
      await readFile(`${destination}/render-before-cache.json`, "utf8"),
    );
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:5173/");
    report.browsers[name] = await page.evaluate(async (spritesOnly) => {
      const { sprite } = await import("/src/art.js"),
        { Renderer } = await import("/src/render.js"),
        { Game, createRun } = await import("/src/game.js");
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 600;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      const results = [];
      async function capture(name, x, y, width, height) {
        const bytes = ctx.getImageData(x, y, width, height).data;
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        results.push({
          case: name,
          hash: [...new Uint8Array(hash)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        });
      }
      for (const name of [
        "player",
        "crawler",
        "shooter",
        "charger",
        "shield",
        "moth",
        "weaver",
        "ferryman",
        "gardener",
        "heart",
      ])
        for (const scale of [1, 1.25, 1.7])
          for (const palette of ["normal", "echo", "flash"])
            for (const flip of [false, true])
              for (const walk of [0, 1, 2, 3]) {
                ctx.fillStyle = "#13252f";
                ctx.fillRect(0, 0, 960, 600);
                sprite(ctx, name, 100.75, 110.25, {
                  scale,
                  echo: palette === "echo",
                  flash: palette === "flash",
                  flip,
                  walk,
                  moving: name === "player",
                  idle: 3,
                });
                await capture(
                  `sprite:${name}:${scale}:${palette}:${flip}:${walk}`,
                  50,
                  50,
                  100,
                  100,
                );
              }
      const renderer = new Renderer(canvas);
      for (const stage of spritesOnly ? [] : [0, 1, 9, 17, 7, 15, 23]) {
        const run = createRun("CACHE-PIXEL");
        run.stage = stage;
        const g = new Game(run);
        g.enemies = [];
        g.spawnQueue = [];
        g.apparatus = null;
        g.beacon = null;
        g.t = 1.5;
        for (const mode of ["combat", "cleared"]) {
          g.mode = mode;
          renderer.draw(g, 1.5, { shake: false, flashes: true }, {});
          await capture(`room:${stage}:${mode}`, 0, 0, 960, 600);
        }
      }
      return results;
    }, spritesOnly);
    if (reference) {
      const expected = new Map(
        reference.browsers[name]
          .filter((entry) => !spritesOnly || entry.case.startsWith("sprite:"))
          .map((entry) => [entry.case, entry.hash]),
      );
      const changed = report.browsers[name]
        .filter((entry) => expected.get(entry.case) !== entry.hash)
        .map((entry) => entry.case);
      assert.equal(
        changed.length,
        0,
        `${name}: ${changed.length} changed pixel cases; first cases: ${changed.slice(0, 12).join(", ")}`,
      );
      assert.equal(report.browsers[name].length, expected.size);
    }
    console.log(
      `${name}: ${report.browsers[name].length} pixel ${baseline ? "references saved" : "comparisons passed"}`,
    );
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${destination}/${spritesOnly ? "render-sprites" : `render-${baseline ? "before" : "after"}-cache`}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
