import { chromium, firefox, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const baseline = process.argv.includes("--baseline");
const destination = ".mdxr/20261007195700-echo-loom/assets";
const reference = baseline
  ? null
  : JSON.parse(
      await readFile(`${destination}/pixel-lines-before.json`, "utf8"),
    );
const report = {
  scope:
    "Native Canvas pixel hashes against the individual fillRect line baseline. Rounded endpoints, cardinal/diagonal/reversed/long/capped/zero-length lines, opaque and translucent color and context alpha, integer/fractional/scaled transforms, source-over and additive compositing. This checks rendering semantics, not physical device performance.",
  browsers: {},
};
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/");
    const cases = await page.evaluate(async () => {
      const { pixelLine } = await import("/src/art.js");
      const cases = [];
      const lines = [
        [8, 12, 85, 12],
        [12, 8, 12, 85],
        [8, 8, 85, 85],
        [85, 8, 8, 85],
        [80, 60, 12, 15],
        [8.4, 12.7, 83.6, 50.2],
        [30, 30, 30, 30],
        [-5, 20, 2000, 70],
      ];
      for (const [lineIndex, endpoints] of lines.entries())
        for (const width of [1, 2, 7])
          for (const alpha of [1, 0.18, 0.65])
            for (const color of ["#7cdcc7", "#7cdcc755"])
              for (const transform of ["integer", "fractional", "scale"])
                for (const composite of ["source-over", "lighter"]) {
                  const canvas = Object.assign(
                    document.createElement("canvas"),
                    { width: 96, height: 96 },
                  );
                  const c = canvas.getContext("2d", { alpha: false });
                  c.fillStyle = "#13252f";
                  c.fillRect(0, 0, 96, 96);
                  if (transform === "integer") c.translate(2, -1);
                  else if (transform === "fractional") c.translate(0.3, 0.7);
                  else c.scale(0.85, 0.9);
                  c.globalAlpha = alpha;
                  c.globalCompositeOperation = composite;
                  // Preserve the caller's current path as well as its pixels.
                  c.beginPath();
                  c.rect(88, 88, 3, 3);
                  pixelLine(c, ...endpoints, color, width);
                  c.globalAlpha = 1;
                  c.fillStyle = "#e4bc80";
                  c.fill();
                  const bytes = c.getImageData(0, 0, 96, 96).data;
                  const hash = [
                    ...new Uint8Array(
                      await crypto.subtle.digest("SHA-256", bytes),
                    ),
                  ]
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");
                  cases.push({
                    case: [
                      lineIndex,
                      width,
                      alpha,
                      color,
                      transform,
                      composite,
                    ].join(":"),
                    hash,
                  });
                }
      return cases;
    });
    if (reference) {
      const expected = new Map(
        reference.browsers[name].map((entry) => [entry.case, entry.hash]),
      );
      const changed = cases.filter(
        (entry) => expected.get(entry.case) !== entry.hash,
      );
      assert.equal(cases.length, expected.size);
      assert.deepEqual(changed, [], `${name}: changed line pixels`);
    }
    assert.deepEqual(errors, []);
    report.browsers[name] = cases;
    console.log(
      `${name}: ${cases.length} line pixel ${baseline ? "references recorded" : "comparisons passed"}`,
    );
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${destination}/pixel-lines-${baseline ? "before" : "after"}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
