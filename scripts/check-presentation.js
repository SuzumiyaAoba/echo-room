import { chromium, firefox, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const destination = ".mdxr/20261007195700-echo-loom/assets";
const sources = Object.fromEntries(
  await Promise.all(
    ["before", "prototype"].map(async (variant) => [
      variant,
      await readFile(
        `${destination}/renderer-presentation-${variant}.js`,
        "utf8",
      ),
    ]),
  ),
);
const report = {
  scope:
    "Native browser screenshot comparison of legacy 960x600 presentation and direct 480x300 presentation. Identical logical world pixels, three regions with echoes and warnings, and title. Integer and fractional CSS scale at device pixel ratios one and two. This is presentation evidence, not physical device performance or a human readability assessment.",
  experiment: true,
  browsers: {},
};

for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch({ headless: true });
  try {
    const cases = [];
    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({
        viewport: { width: 1200, height: 850 },
        deviceScaleFactor,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/src/main.js*", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: 'import "/src/style.css";',
        }),
      );
      for (const [variant, body] of Object.entries(sources))
        await page.route(`**/src/render.js?presentation-${variant}`, (route) =>
          route.fulfill({ contentType: "text/javascript", body }),
        );
      await page.goto("http://127.0.0.1:5173/");
      for (const stage of [-1, 0, 8, 16]) {
        const logical = await page.evaluate(async (stage) => {
          const { Renderer } = await import(
            "/src/render.js?presentation-before"
          );
          const { Renderer: DirectRenderer } = await import(
            "/src/render.js?presentation-prototype"
          );
          const { Game, createRun } = await import("/src/game.js");
          const legacy = Object.assign(document.createElement("canvas"), {
            width: 960,
            height: 600,
            id: "presentation-legacy",
          });
          const direct = Object.assign(document.createElement("canvas"), {
            width: 480,
            height: 300,
            id: "presentation-direct",
          });
          const holder = document.createElement("div");
          Object.assign(holder.style, {
            position: "absolute",
            left: "0",
            top: "0",
          });
          for (const c of [legacy, direct])
            Object.assign(c.style, {
              position: "absolute",
              inset: "0",
              width: "100%",
              height: "100%",
              display: "block",
            });
          holder.append(legacy, direct);
          document.body.replaceChildren(holder);
          const run = createRun("PRESENTATION-PIXELS");
          run.stage = Math.max(0, stage);
          const g = stage < 0 ? null : new Game(run);
          if (g) {
            g.t = 2;
            g.spawnQueue = [];
            g.enemies = [];
            g.spawn("crawler", 143, 149);
            const shooter = g.spawn("shooter", 337, 83);
            shooter.state = "windup";
            shooter.aimAngle = 1.9;
            g.echoes = [
              { x: 144, y: 218, r: 5, elapsed: 1, angle: -1, frame: 60 },
            ];
            g.hazards.push({
              kind: "circle",
              x: 285,
              y: 152,
              r: 21,
              age: 0.45,
              duration: 1.2,
            });
          }
          const oldRenderer = new Renderer(legacy);
          oldRenderer.draw(g, 2, { shake: false, flashes: true }, {});
          const directRenderer = new DirectRenderer(direct);
          directRenderer.draw(g, 2, { shake: false, flashes: true }, {});
          const before = oldRenderer.g.getImageData(0, 0, 480, 300).data;
          const after = direct
            .getContext("2d")
            .getImageData(0, 0, 480, 300).data;
          let different = 0;
          for (let i = 0; i < before.length; i++)
            if (before[i] !== after[i]) different++;
          window.__presentationHolder = holder;
          return {
            differentChannels: different,
          };
        }, stage);
        assert.equal(
          logical.differentChannels,
          0,
          `${name}/${stage}: logical pixels`,
        );
        for (const width of [480, 640, 960, 1200]) {
          const screenshots = {};
          for (const mode of ["legacy", "pixelated", "crisp-edges"]) {
            await page.evaluate(
              ({ width, mode }) => {
                const holder = window.__presentationHolder;
                holder.style.width = `${width}px`;
                holder.style.height = `${(width * 300) / 480}px`;
                holder.querySelector("#presentation-legacy").style.visibility =
                  mode === "legacy" ? "visible" : "hidden";
                const direct = holder.querySelector("#presentation-direct");
                direct.style.visibility =
                  mode === "legacy" ? "hidden" : "visible";
                direct.style.imageRendering =
                  mode === "legacy" ? "pixelated" : mode;
              },
              { width, mode },
            );
            screenshots[mode] = await page.locator("body > div").screenshot();
            if (
              name === "chromium" &&
              deviceScaleFactor === 1 &&
              stage === 0 &&
              [640, 1200].includes(width)
            )
              await writeFile(
                `${destination}/canvas-presentation-${width}-${mode}.png`,
                screenshots[mode],
              );
          }
          const compared = await page.evaluate(
            async (screenshots) => {
              const pixels = {};
              for (const [mode, data] of Object.entries(screenshots)) {
                const img = new Image();
                img.src = `data:image/png;base64,${data}`;
                await img.decode();
                const c = Object.assign(document.createElement("canvas"), {
                  width: img.width,
                  height: img.height,
                });
                const ctx = c.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);
                pixels[mode] = ctx.getImageData(0, 0, c.width, c.height).data;
              }
              return Object.fromEntries(
                ["pixelated", "crisp-edges"].map((mode) => {
                  let changedPixels = 0,
                    maxChannelDelta = 0;
                  for (let i = 0; i < pixels.legacy.length; i += 4) {
                    let changed = false;
                    for (let channel = 0; channel < 3; channel++) {
                      const delta = Math.abs(
                        pixels.legacy[i + channel] - pixels[mode][i + channel],
                      );
                      if (delta) changed = true;
                      maxChannelDelta = Math.max(maxChannelDelta, delta);
                    }
                    if (changed) changedPixels++;
                  }
                  return [
                    mode,
                    {
                      changedPixels,
                      totalPixels: pixels.legacy.length / 4,
                      maxChannelDelta,
                    },
                  ];
                }),
              );
            },
            Object.fromEntries(
              Object.entries(screenshots).map(([key, value]) => [
                key,
                value.toString("base64"),
              ]),
            ),
          );
          if ([480, 960].includes(width))
            for (const [mode, comparison] of Object.entries(compared))
              assert.equal(
                comparison.changedPixels,
                0,
                `${name}/${deviceScaleFactor}/${stage}/${width}/${mode}: integer scaling`,
              );
          cases.push({
            stage,
            deviceScaleFactor,
            cssWidth: width,
            logical,
            compared,
          });
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    report.browsers[name] = cases;
    console.log(`${name}: ${cases.length} presentation comparisons passed`);
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${destination}/canvas-presentation-css.json`,
  JSON.stringify(report, null, 2) + "\n",
);
