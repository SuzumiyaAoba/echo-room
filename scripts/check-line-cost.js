import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { withLegacyPixelLine } from "./line-reference.js";

const destination = ".mdxr/20261007195700-echo-loom/assets";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const legacyArt = withLegacyPixelLine(await readFile("src/art.js", "utf8"));
  const modules = [
    "render",
    "apparatus-render",
    "arena-render",
    "scenery-render",
    "stolen-echo-render",
  ];
  await page.route("**/src/art.js?line-reference", (route) =>
    route.fulfill({ contentType: "text/javascript", body: legacyArt }),
  );
  for (const name of modules) {
    let source = (await readFile(`src/${name}.js`, "utf8")).replaceAll(
      '"./art.js"',
      '"./art.js?line-reference"',
    );
    for (const dependency of modules)
      source = source.replaceAll(
        `"./${dependency}.js"`,
        `"./${dependency}.js?line-reference"`,
      );
    await page.route(`**/src/${name}.js?line-reference`, (route) =>
      route.fulfill({ contentType: "text/javascript", body: source }),
    );
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("http://127.0.0.1:5173/");
  const result = await page.evaluate(async () => {
    const { Renderer } = await import("/src/render.js");
    const { Renderer: LegacyRenderer } = await import(
      "/src/render.js?line-reference"
    );
    const { Game, createRun } = await import("/src/game.js");
    const { UPGRADES } = await import("/src/content.js");
    const run = createRun("STATIC-LINE-COST");
    run.stage = 20;
    run.upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
    const g = new Game(run);
    g.t = 2;
    g.spawnQueue = [];
    g.enemies = [];
    for (let i = 0; i < 60; i++)
      g.spawn(
        ["crawler", "shooter", "charger", "shield", "moth", "weaver"][i % 6],
        60 + (i % 10) * 36,
        60 + Math.floor(i / 10) * 32,
      );
    g.echoes = [0, 1, 2].map((index) => ({
      x: 240 + Math.cos(index * 2) * 140,
      y: 156 + Math.sin(index * 2) * 80,
      r: 5,
      elapsed: 1,
      angle: index,
      frame: 60,
    }));
    g.bullets = [];
    for (let i = 0; i < 600; i++) {
      const a = i * 2.399;
      g.makeBullet(
        { x: 240 + Math.cos(a) * 140, y: 156 + Math.sin(a) * 80 },
        a + Math.PI,
        1,
        42,
        i % 2 === 0,
        "#eca886",
      );
    }
    g.particles = Array.from({ length: 500 }, (_, i) => ({
      x: 40 + ((i * 31) % 390),
      y: 40 + ((i * 43) % 220),
      life: 0.3,
      color: "#7cdcc7",
    }));
    const canvas = () =>
      Object.assign(document.createElement("canvas"), {
        width: 960,
        height: 600,
      });
    const renderers = {
      legacy: new LegacyRenderer(canvas()),
      batched: new Renderer(canvas()),
    };
    const draw = (renderer) =>
      renderer.draw(g, 2, { shake: false, flashes: true }, {});
    const state = JSON.stringify(g);
    for (let i = 0; i < 20; i++)
      for (const renderer of Object.values(renderers)) draw(renderer);
    const callCounts = {};
    const prototype = CanvasRenderingContext2D.prototype;
    const originals = Object.fromEntries(
      ["fillRect", "fill", "drawImage"].map((key) => [key, prototype[key]]),
    );
    try {
      for (const [name, renderer] of Object.entries(renderers)) {
        const counts = { fillRect: 0, fill: 0, drawImage: 0 };
        for (const [key, native] of Object.entries(originals))
          prototype[key] = function (...args) {
            if (this === renderer.g) counts[key]++;
            return native.apply(this, args);
          };
        draw(renderer);
        callCounts[name] = counts;
      }
    } finally {
      for (const [key, native] of Object.entries(originals))
        prototype[key] = native;
    }
    // Both renderers see the same frozen scene, in one browser. Alternate the
    // order to limit warm-up and submission-order effects; wrappers are removed.
    const groups = { legacy: [], batched: [] };
    for (let i = 0; i < 60; i++) {
      await new Promise(requestAnimationFrame);
      for (const name of i % 2
        ? ["batched", "legacy"]
        : ["legacy", "batched"]) {
        const start = performance.now();
        for (let frame = 0; frame < 3; frame++) draw(renderers[name]);
        groups[name].push((performance.now() - start) / 3);
      }
    }
    const timing = Object.fromEntries(
      Object.entries(groups).map(([name, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return [
          name,
          {
            samples: values.length,
            medianMs: sorted[30],
            p95Ms: sorted[57],
            maxMs: sorted.at(-1),
            values,
          },
        ];
      }),
    );
    return {
      callCounts,
      timing,
      statePreserved: JSON.stringify(g) === state,
      scene: {
        enemies: g.enemies.length,
        bullets: g.bullets.length,
        particles: g.particles.length,
        echoes: g.echoes.length,
      },
    };
  });
  assert.deepEqual(errors, []);
  assert.ok(result.statePreserved);
  assert.ok(
    result.callCounts.batched.fillRect < result.callCounts.legacy.fillRect,
  );
  const report = {
    scope:
      "Local native headless Chromium, CPU rate four. Same frozen synthetic scene in one page, original and batched renderers alternating order over sixty groups of three draws after warm-up. Draw submission durations and logical-buffer fill calls, not requestAnimationFrame performance, normal gameplay, audio or physical device performance.",
    ...result,
    errors,
  };
  await writeFile(
    `${destination}/line-cost.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      ...report,
      timing: Object.fromEntries(
        Object.entries(report.timing).map(([key, { values, ...summary }]) => [
          key,
          summary,
        ]),
      ),
    }),
  );
} finally {
  await browser.close();
}
