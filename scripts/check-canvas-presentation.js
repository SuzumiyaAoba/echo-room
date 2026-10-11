import { developmentURL } from "./browser-url.js";
import {
  observationDirectory,
  observationInputPath,
} from "./observation-files.js";
import { chromium, firefox, webkit } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const destination = observationDirectory;
const mode = process.argv[2] || "pixels";
assert.ok(["pixels", "cost"].includes(mode));
const sources = Object.fromEntries(
  await Promise.all(
    ["before", "prototype"].map(async (name) => [
      name,
      await readFile(
        await observationInputPath(`renderer-presentation-${name}.js`),
        "utf8",
      ),
    ]),
  ),
);
const report = {
  scope:
    mode === "pixels"
      ? "Frozen scenes, native Chromium/Firefox/WebKit. Immutable two-canvas renderer versus direct logical-canvas prototype; exact logical RGBA bytes and nearest-neighbor 2x presentation bytes. No gameplay update or physical-device claim."
      : "Native Chromium, CPU rate four, same frozen synthetic scene and page. Both canvases visible at equal CSS size. Alternating order, sixty groups of three draws, after warm-up; no pixel readback or game/audio loop. Submission duration, not display frame rate or physical-device performance.",
  mode,
  browsers: {},
};
for (const [name, type] of Object.entries(
  mode === "cost" ? { chromium } : { chromium, firefox, webkit },
)) {
  const browser = await type.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
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
    if (mode === "cost") {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await page.goto(developmentURL);
    const result = await page.evaluate(async (mode) => {
      const { Renderer: Before } = await import(
        "/src/render.js?presentation-before"
      );
      const { Renderer: Direct } = await import(
        "/src/render.js?presentation-prototype"
      );
      const { Game, createRun } = await import("/src/game.js");
      const { UPGRADES } = await import("/src/content.js");
      const { CITY_MEMORIES } = await import("/src/story.js");
      const holder = document.createElement("div");
      Object.assign(holder.style, {
        display: "flex",
        position: "absolute",
        inset: "0 auto auto 0",
      });
      document.body.replaceChildren(holder);
      const renderers = Object.fromEntries(
        [
          ["before", Before],
          ["direct", Direct],
        ].map(([name, Type]) => {
          const canvas = document.createElement("canvas");
          canvas.width = 960;
          canvas.height = 600;
          Object.assign(canvas.style, {
            width: "480px",
            height: "300px",
            imageRendering: "pixelated",
          });
          holder.append(canvas);
          return [name, new Type(canvas)];
        }),
      );
      const scene = (stage, variant = 0, stress = false) => {
        const run = createRun("CANVAS-PRESENTATION");
        run.stage = stage;
        run.upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
        const g = new Game(run);
        g.t = 2.37;
        g.spawnQueue = [];
        g.enemies = [];
        const kinds = [
          "crawler",
          "shooter",
          "charger",
          "shield",
          "moth",
          "weaver",
        ];
        for (let i = 0; i < (stress ? 60 : 6); i++) {
          const e = g.spawn(
            kinds[i % kinds.length],
            60 + (i % 10) * 36,
            60 + Math.floor(i / 10) * 32,
          );
          if (i === 1) {
            e.state = "windup";
            e.aimAngle = 1.9;
          }
        }
        if (g.boss) {
          g.enemies.push(g.boss);
          g.boss.state = "windup";
          g.boss.plan = { angles: [-1.5, 0, 1.5] };
        }
        g.echoes = [0, 1, 2].map((index) => ({
          x: 240 + Math.cos(index * 2) * 140,
          y: 156 + Math.sin(index * 2) * 80,
          r: 5,
          elapsed: 1,
          angle: index,
          frame: 60,
          returnStock: variant % 2 ? 3 : index,
        }));
        g.bullets = [];
        for (let i = 0; i < (stress ? 600 : 24); i++) {
          const a = i * 2.399;
          const bullet = g.makeBullet(
            { x: 240 + Math.cos(a) * 140, y: 156 + Math.sin(a) * 80 },
            a + Math.PI,
            1,
            42,
            i % 2 === 0,
            "#eca886",
          );
          if (i % 3 === 0) bullet.returnedLight = true;
        }
        g.particles = Array.from({ length: stress ? 500 : 20 }, (_, i) => ({
          x: 40 + ((i * 31) % 390),
          y: 40 + ((i * 43) % 220),
          life: 0.3,
          size: 2,
          color: "#7cdcc7",
        }));
        g.hazards.push(
          { kind: "circle", x: 285, y: 152, r: 21, age: 0.45, duration: 1.2 },
          { kind: "line", axis: "v", x: 160, r: 5, age: 0.2, duration: 1.2 },
          { kind: "threadGuard", x: 235, y: 108, age: 0.12, duration: 0.4 },
        );
        g.shake = variant === 3 ? 4 : 0;
        g.hitCue = {
          age: 0.1,
          duration: 0.6,
          kind: variant % 2 ? "shield" : "damage",
          angle: 0.7,
        };
        g.label(235, 210, "返し針 3", "#f3d69a");
        if (variant === 2) g.mode = "cleared";
        return g;
      };
      const settingsFor = (variant) => ({
        shake: variant === 3,
        flashes: variant % 2 === 0,
      });
      const draw = (renderer, g, variant = 0, profile = {}) =>
        renderer.draw(g, 2.37, settingsFor(variant), profile);
      if (mode === "pixels") {
        const cases = [];
        const compare = (a, b) => {
          let channels = 0,
            pixels = 0,
            first = null;
          for (let i = 0; i < a.length; i += 4) {
            let changed = false;
            for (let n = 0; n < 4; n++)
              if (a[i + n] !== b[i + n]) {
                channels++;
                changed = true;
                first ??= { offset: i + n, before: a[i + n], after: b[i + n] };
              }
            if (changed) pixels++;
          }
          return { channels, pixels, first };
        };
        const scaled = document.createElement("canvas");
        scaled.width = 960;
        scaled.height = 600;
        const scaledCtx = scaled.getContext("2d", { alpha: false });
        scaledCtx.imageSmoothingEnabled = false;
        const check = (label, g, variant, profile = {}) => {
          const state = JSON.stringify(g);
          for (const renderer of Object.values(renderers))
            draw(renderer, g, variant, profile);
          const logical = compare(
            renderers.before.g.getImageData(0, 0, 480, 300).data,
            renderers.direct.g.getImageData(0, 0, 480, 300).data,
          );
          scaledCtx.drawImage(renderers.direct.canvas, 0, 0, 960, 600);
          const doubled = compare(
            renderers.before.ctx.getImageData(0, 0, 960, 600).data,
            scaledCtx.getImageData(0, 0, 960, 600).data,
          );
          cases.push({
            label,
            logical,
            doubled,
            statePreserved: JSON.stringify(g) === state,
          });
        };
        check("title-night", null, 0);
        check("title-dawn", null, 0, { victories: 1 });
        check("title-restored", null, 0, {
          victories: 1,
          remembered: CITY_MEMORIES.map((m) => m.key),
        });
        for (let stage = 0; stage < 24; stage++)
          for (let variant = 0; variant < 4; variant++)
            check(
              `stage-${stage}-variant-${variant}`,
              scene(stage, variant),
              variant,
            );
        return { cases };
      }
      const g = scene(20, 1, true),
        state = JSON.stringify(g);
      for (let i = 0; i < 20; i++)
        for (const renderer of Object.values(renderers)) draw(renderer, g);
      const counts = {},
        proto = CanvasRenderingContext2D.prototype;
      const native = proto.drawImage;
      try {
        for (const [name, renderer] of Object.entries(renderers)) {
          counts[name] = { logicalCopies: 0, presentationCopies: 0 };
          proto.drawImage = function (...args) {
            if (this === renderer.g) counts[name].logicalCopies++;
            if (
              this === renderer.ctx &&
              args[0] === renderer.buffer &&
              args.length === 5
            )
              counts[name].presentationCopies++;
            return native.apply(this, args);
          };
          draw(renderer, g);
        }
      } finally {
        proto.drawImage = native;
      }
      const groups = { before: [], direct: [] };
      for (let i = 0; i < 60; i++) {
        await new Promise(requestAnimationFrame);
        for (const name of i % 2
          ? ["direct", "before"]
          : ["before", "direct"]) {
          const start = performance.now();
          for (let frame = 0; frame < 3; frame++) draw(renderers[name], g);
          groups[name].push((performance.now() - start) / 3);
        }
      }
      return {
        counts,
        statePreserved: JSON.stringify(g) === state,
        scene: {
          enemies: g.enemies.length,
          bullets: g.bullets.length,
          particles: g.particles.length,
          echoes: g.echoes.length,
        },
        timing: Object.fromEntries(
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
        ),
      };
    }, mode);
    report.browsers[name] = { ...result, errors };
    await writeFile(
      `${destination}/canvas-presentation-${mode}.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    assert.deepEqual(errors, []);
    if (mode === "pixels")
      for (const c of result.cases) {
        assert.equal(c.logical.channels, 0, `${name}/${c.label}/logical`);
        assert.equal(c.doubled.channels, 0, `${name}/${c.label}/doubled`);
        assert.ok(c.statePreserved, `${name}/${c.label}/state`);
      }
    else {
      assert.ok(result.statePreserved);
      assert.equal(result.counts.before.presentationCopies, 1);
      assert.equal(result.counts.direct.presentationCopies, 0);
    }
    console.log(
      JSON.stringify({
        browser: name,
        mode,
        cases: result.cases?.length,
        counts: result.counts,
        timing:
          result.timing &&
          Object.fromEntries(
            Object.entries(result.timing).map(([n, { values, ...s }]) => [
              n,
              s,
            ]),
          ),
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
}
