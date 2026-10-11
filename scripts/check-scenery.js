import { chromium, firefox, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { withLegacyPixelLine } from "./line-reference.js";

const before = process.argv.includes("--before");
const legacyLines = process.argv.includes("--legacy-lines");
const tag = process.argv.find((arg) => arg.startsWith("--tag="))?.slice(6);
if (tag && !/^[a-z0-9-]+$/.test(tag))
  throw new Error("Expected a simple artifact tag");
const destination = ".mdxr/20261007195700-echo-loom/assets";
const phase = tag || (before ? "before" : "after");
const compare = process.argv
  .find((arg) => arg.startsWith("--compare="))
  ?.slice(10);
if (compare && !/^[a-z0-9-]+$/.test(compare))
  throw new Error("Expected a simple comparison tag");
const reference = compare
  ? JSON.parse(await readFile(`${destination}/scenery-${compare}.json`, "utf8"))
  : null;
const report = {
  scope:
    "Native Canvas scenery fixtures, not encounter balance or human readability ratings. Actual seeded room layouts, normal actors, echoes, warnings and apparatus. Render calls must preserve combat/save/random state and pause at the room clock. Static pixels change intentionally; actor integrity is checked separately.",
  browsers: {},
  legacyLines,
};
for (const [name, type] of Object.entries(
  before ? { chromium } : { chromium, firefox, webkit },
)) {
  const browser = await type.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 850 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (legacyLines) {
      const source = withLegacyPixelLine(await readFile("src/art.js", "utf8"));
      await page.route("http://127.0.0.1:5173/src/art.js*", (route) =>
        route.fulfill({ contentType: "text/javascript", body: source }),
      );
    }
    await page.goto("http://127.0.0.1:5173/");
    const cases = [];
    for (const stage of [0, 8, 16, 1, 9, 17, 7, 15, 23]) {
      const result = await page.evaluate(async (stage) => {
        const { Renderer } = await import("/src/render.js");
        const { Game, createRun } = await import("/src/game.js");
        const { ENEMIES, isBoss } = await import("/src/content.js");
        const canvas =
          document.querySelector("#scenery-preview") ||
          Object.assign(document.createElement("canvas"), {
            id: "scenery-preview",
            width: 960,
            height: 600,
          });
        document.body.replaceChildren(canvas);
        const renderer = new Renderer(canvas);
        const run = createRun("SCENERY-REVIEW");
        run.stage = stage;
        run.upgrades.double = 1;
        const g = new Game(run);
        g.t = 2;
        g.spawnQueue = [];
        g.enemies = [];
        for (const [kind, x, y] of isBoss(stage)
          ? [[g.biome.boss, 240, 112]]
          : [
              ["crawler", 143, 149],
              ["shooter", 337, 83],
              ["shield", 194, 172],
            ]) {
          const e = g.spawn(kind, x, y);
          if (kind === "shooter") {
            e.state = "windup";
            e.aimAngle = 1.9;
          }
        }
        g.echoes = [
          { x: 144, y: 218, r: 5, elapsed: 1, angle: -1, frame: 60 },
          { x: 326, y: 206, r: 5, elapsed: 1, angle: -1, frame: 60 },
        ];
        g.hazards.push({
          kind: "circle",
          x: 285,
          y: 152,
          r: 21,
          age: 0.45,
          duration: 1.2,
        });
        // Spawn particles use cosmetic Math.random. Exclude those particles
        // from static fixtures so cross-run pixel comparisons are repeatable.
        g.particles = [];
        const state = () =>
          JSON.stringify({
            run: g.run,
            rng: g.rng,
            tiles: g.tiles,
            history: g.history,
            enemies: g.enemies,
            echoes: g.echoes,
            hazards: g.hazards,
            apparatus: g.apparatus,
            player: g.player,
            t: g.t,
          });
        const hash = async () => {
          const data = canvas
            .getContext("2d")
            .getImageData(0, 0, 960, 600).data;
          return [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
          ]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("");
        };
        const original = state();
        renderer.draw(g, 2, { shake: false, flashes: true });
        const initial = await hash();
        renderer.draw(g, 200, { shake: false, flashes: true });
        const paused = await hash();
        g.t = 3;
        renderer.draw(g, 200, { shake: false, flashes: true });
        const moving = await hash();
        g.t = 2;
        renderer.draw(g, 2, { shake: false, flashes: false });
        const reduced = await hash();
        renderer.draw(g, 2, { shake: false, flashes: true });
        return {
          stage,
          biome: g.biome.name,
          layout: g.layout.name,
          initial,
          paused,
          moving,
          reduced,
          statePreserved: state() === original,
          finite: g.enemies.every((e) => Number.isFinite(e.x + e.y)),
          actors: g.enemies.map((e) => ENEMIES[e.kind].name),
        };
      }, stage);
      assert.equal(result.initial, result.paused, `${name}/${stage}: pause`);
      assert.notEqual(result.initial, result.moving, `${name}/${stage}: time`);
      assert.ok(
        result.statePreserved,
        `${name}/${stage}: render changed state`,
      );
      assert.ok(result.finite);
      if (reference) {
        const expected = reference.browsers[name].cases.find(
          (entry) => entry.stage === stage,
        );
        for (const field of ["initial", "paused", "moving", "reduced"])
          assert.equal(
            result[field],
            expected[field],
            `${name}/${stage}: ${field} pixel parity`,
          );
      }
      cases.push(result);
      if (name === "chromium")
        await page.locator("#scenery-preview").screenshot({
          path: `${destination}/scenery-${phase}-${stage}.png`,
        });
    }
    assert.deepEqual(errors, []);
    report.browsers[name] = { cases, errors };
    console.log(`${name}: ${cases.length} scenery/pause/state fixtures passed`);
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${destination}/scenery-${phase}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
