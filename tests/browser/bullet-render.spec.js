import { test, expect } from "@playwright/test";

async function isolate(page) {
  await page.route("**/src/main.js*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await page.goto("/");
  await page.evaluate(async () => {
    const { drawBullets } = await import("/src/bullet-render.js");
    const { pixelLine } = await import("/src/art.js");
    const create = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 300;
      const c = canvas.getContext("2d", { alpha: false });
      c.imageSmoothingEnabled = false;
      return c;
    };
    // Independent native reference: the three original rectangles, snapped
    // to logical pixels. Friendly trails retain their original positions.
    const reference = (c, bullets) => {
      for (const b of bullets) {
        if (b.friendly) {
          if (b.shortRange) c.globalAlpha = Math.min(1, b.life / 0.15);
          pixelLine(
            c,
            b.x,
            b.y,
            b.x - b.vx * b.trail,
            b.y - b.vy * b.trail,
            b.color,
            1,
          );
          c.fillStyle = "#f3f5d5";
          c.fillRect(b.x - 1, b.y - 1, 2, 2);
          c.globalAlpha = 1;
        } else {
          const x = Math.round(b.x),
            y = Math.round(b.y);
          c.fillStyle = "#553334";
          c.fillRect(x - 3, y - 3, 6, 6);
          c.fillStyle = b.color;
          c.fillRect(x - 2, y - 2, 4, 4);
          c.fillStyle = "#ffe4bd";
          c.fillRect(x - 1, y - 1, 2, 2);
        }
      }
    };
    const compare = (a, b) => {
      const x = a.getImageData(0, 0, 480, 300).data;
      const y = b.getImageData(0, 0, 480, 300).data;
      let channels = 0;
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) channels++;
      return channels;
    };
    const bullets = (count = 300) =>
      Array.from({ length: count }, (_, i) => ({
        x: 20.3 + ((i * 29.37) % 440),
        y: 24.8 + ((i * 37.21) % 250),
        color: ["#eca886", "#f3a985", "#d48b94", "#ecd293", "#a9cfd0"][i % 5],
        friendly: false,
        vx: 14,
        vy: -7,
        trail: 0.7,
        shortRange: false,
        life: 0.09,
      }));
    window.__BULLET_TEST__ = {
      drawBullets,
      create,
      reference,
      compare,
      bullets,
    };
  });
}

test("大量の敵弾をまとめても重なり・画面端・整数の揺れを元の矩形と同じ画素で描く", async ({
  page,
}) => {
  await isolate(page);
  const results = await page.evaluate(() => {
    const { drawBullets, create, reference, compare, bullets } =
      window.__BULLET_TEST__;
    return [
      "spread",
      "overlap",
      "edges",
      "positive-shake",
      "negative-shake",
      "nonfinite",
    ].map((pattern) => {
      const a = create(),
        b = create(),
        list = bullets();
      for (const [i, v] of list.entries()) {
        if (pattern === "overlap") {
          v.x = 120 + (i % 3) * 0.35;
          v.y = 155 + (i % 4) * 0.4;
        }
        if (pattern.includes("shake") || pattern === "edges")
          [v.x, v.y] = [
            [-1.2, 0.3],
            [479.9, 1.2],
            [0.1, 299.9],
            [481.1, 300.1],
            [-3.2, -3.2],
            [240.4, 298.7],
          ][i % 6];
        if (pattern === "nonfinite" && i === 3) v.x = NaN;
      }
      const state = JSON.stringify(list);
      for (const c of [a, b]) {
        c.fillStyle = "#142f33";
        c.fillRect(0, 0, 480, 300);
        if (pattern === "positive-shake") c.translate(3, 2);
        if (pattern === "negative-shake") c.translate(-3, -2);
      }
      let copies = 0;
      const native = b.drawImage.bind(b);
      b.drawImage = (...args) => {
        copies++;
        return native(...args);
      };
      reference(a, list);
      drawBullets(b, list);
      return {
        pattern,
        channels: compare(a, b),
        copies,
        unchanged: JSON.stringify(list) === state,
        sameStyle: a.fillStyle === b.fillStyle,
      };
    });
  });
  for (const result of results) {
    expect(result.channels, result.pattern).toBe(0);
    expect(result.copies, result.pattern).toBeGreaterThan(0);
    expect(result.unchanged).toBe(true);
    expect(result.sameStyle).toBe(true);
  }
});

test("敵味方の順番と半透明色を保ち、同じレイヤーの更新後や弾の消滅後に残像を残さない", async ({
  page,
}) => {
  await isolate(page);
  const results = await page.evaluate(() => {
    const { drawBullets, create, reference, compare, bullets } =
      window.__BULLET_TEST__;
    const a = create(),
      b = create(),
      results = [];
    for (const pattern of [
      "mixed",
      "moved",
      "short-range",
      "alpha-color",
      "empty",
      "global-alpha",
      "composite",
      "scaled",
      "small",
    ]) {
      const list =
        pattern === "empty" ? [] : bullets(pattern === "small" ? 24 : 300);
      for (const [i, v] of list.entries()) {
        if (["mixed", "moved", "short-range"].includes(pattern))
          v.friendly = [140, 281].includes(i);
        if (pattern === "moved") {
          v.x = 420 - (i % 8);
          v.y = 280 - (i % 11);
        }
        if (pattern === "short-range" && v.friendly) v.shortRange = true;
        if (pattern === "alpha-color")
          v.color = i % 2 ? "#eca88680" : "rgba(234,168,134,0.5)";
      }
      for (const c of [a, b]) {
        c.resetTransform();
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
        c.fillStyle = "#243b42";
        c.fillRect(0, 0, 480, 300);
        if (pattern === "global-alpha") c.globalAlpha = 0.4;
        if (pattern === "composite") c.globalCompositeOperation = "lighter";
        if (pattern === "scaled") c.scale(0.75, 0.75);
      }
      reference(a, list);
      drawBullets(b, list);
      results.push({
        pattern,
        channels: compare(a, b),
        sameAlpha: a.globalAlpha === b.globalAlpha,
        sameComposite:
          a.globalCompositeOperation === b.globalCompositeOperation,
      });
    }
    return results;
  });
  for (const result of results) {
    expect(result.channels, result.pattern).toBe(0);
    expect(result.sameAlpha).toBe(true);
    expect(result.sameComposite).toBe(true);
  }
});

test("実際の描画器が全24部屋の弾を繰り返し描いてもゲーム状態と保存を変更しない", async ({
  page,
}) => {
  await isolate(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const { Renderer } = await import("/src/render.js");
    const { Game, createRun } = await import("/src/game.js");
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 600;
    const renderer = new Renderer(canvas);
    const saved = JSON.stringify(localStorage);
    const stages = [];
    for (let stage = 0; stage < 24; stage++) {
      const run = createRun("BULLET-RENDER-READONLY");
      run.stage = stage;
      const game = new Game(run);
      game.spawnQueue = [];
      game.t = 2.37;
      game.shake = 8;
      game.bullets = window.__BULLET_TEST__.bullets();
      const before = JSON.stringify(game);
      for (let i = 0; i < 3; i++)
        renderer.draw(game, 2.37, { shake: true, flashes: false });
      stages.push({ stage, unchanged: JSON.stringify(game) === before });
    }
    return {
      stages,
      saved: JSON.stringify(localStorage) === saved,
      width: canvas.width,
      height: canvas.height,
    };
  });
  expect(result.stages).toHaveLength(24);
  expect(result.stages.every((s) => s.unchanged)).toBe(true);
  expect(result.saved).toBe(true);
  expect([result.width, result.height]).toEqual([960, 600]);
  expect(errors).toEqual([]);
});
