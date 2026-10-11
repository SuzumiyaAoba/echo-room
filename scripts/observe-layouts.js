import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

export async function observeLayoutArt(page) {
  return await page.evaluate(async () => {
    const [
      { Game, createRun },
      { Renderer },
      { Game: Before },
      { Renderer: Old },
      { REGIONAL_LAYOUTS },
      { drawPlayerPresence },
    ] = await Promise.all([
      import("/src/game.js"),
      import("/src/render.js"),
      import("/tests/fixtures/layouts-v1/game.js"),
      import("/tests/fixtures/layouts-v1/render.js"),
      import("/src/room-layouts.js"),
      import("/src/player-presence-render.js"),
    ]);
    const make = () => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      return c;
    };
    const current = new Renderer(make()),
      old = new Old(make());
    const sheets = [],
      rows = [];
    const settings = { shake: false, flashes: false };
    for (let act = 0; act < 3; act++) {
      const sheet = document.createElement("canvas");
      sheet.width = 1440;
      sheet.height = 640;
      const c = sheet.getContext("2d");
      c.imageSmoothingEnabled = false;
      c.fillStyle = "#101f27";
      c.fillRect(0, 0, sheet.width, sheet.height);
      for (let n = 0; n < 6; n++) {
        const layout = REGIONAL_LAYOUTS[act][n];
        let g, seed;
        for (let i = 0; i < 200; i++) {
          seed = `MAP-LOOK-${i}`;
          const run = { ...createRun(seed), stage: act * 8 + 3 };
          // Compare authored room art on the legacy enemy schedule.
          delete run.encounterVersion;
          g = new Game(run);
          if (g.layout.id === layout.id) break;
        }
        if (g.layout.id !== layout.id) throw Error("Missing authored layout");
        const b = new Before({ ...structuredClone(g.run), layoutVersion: 1 });
        const state = JSON.stringify(g),
          previous = JSON.stringify(b);
        old.draw(b, 0, settings);
        // This historical renderer predates the shared player foot marker.
        // At constructor time there are no projectiles, echoes or particles.
        if (b.bullets.length || b.echoes.length || b.particles.length)
          throw Error("Layout art fixture contains effects");
        drawPlayerPresence(old.g, b.player);
        current.draw(b, 0, settings);
        const legacy = current.g.getImageData(0, 0, 480, 300).data,
          original = old.g.getImageData(0, 0, 480, 300).data;
        if (legacy.some((value, i) => value !== original[i]))
          throw Error(`${layout.id}: legacy renderer changed`);
        current.draw(g, 0, settings);
        if (JSON.stringify(g) !== state || JSON.stringify(b) !== previous)
          throw Error("Drawing mutated world");
        const a = current.g.getImageData(0, 0, 480, 300).data,
          z = old.g.getImageData(0, 0, 480, 300).data;
        const bounds = [];
        for (let y = 0; y < g.tiles.length; y++)
          for (let x = 0; x < g.tiles[y].length; x++)
            if (g.tiles[y][x] === 2 || b.tiles[y][x] === 2)
              bounds.push({ x: 16 + x * 16, y: 16 + y * 16 });
        let changed = 0,
          outside = 0;
        for (let i = 0; i < a.length; i += 4)
          if ([0, 1, 2, 3].some((j) => a[i + j] !== z[i + j])) {
            changed++;
            const x = (i / 4) % 480,
              y = Math.floor(i / 4 / 480);
            if (
              !bounds.some(
                (p) =>
                  x >= p.x - 16 &&
                  x < p.x + 32 &&
                  y >= p.y - 16 &&
                  y < p.y + 32,
              )
            )
              outside++;
          }
        if (!changed || outside)
          throw Error(`${layout.id}: unrelated pixels ${outside}`);
        rows.push({
          act,
          seed,
          id: layout.id,
          name: layout.name,
          changed,
          outside,
          legacyExact: true,
          tiles: g.tiles,
          oldTiles: b.tiles,
          rngSame: g.rng.state === b.rng.state,
        });
        const x = (n % 3) * 480,
          y = Math.floor(n / 3) * 320;
        c.fillStyle = "#c6dccb";
        c.font = "12px monospace";
        c.fillText(layout.name, x + 12, y + 15);
        c.drawImage(current.buffer, x, y + 20);
      }
      sheets.push(sheet.toDataURL("image/png"));
    }
    const edge = new Game({ ...createRun("EDGE-0"), stage: 3 });
    Object.assign(edge.player, { x: 141, y: 152 });
    const body = edge.spawn("shield", 93, 152, true),
      rng = edge.rng.state;
    let contact = null;
    for (let frame = 0; frame < 300; frame++) {
      const before = { x: edge.player.x, y: edge.player.y };
      edge.updateEnemy(body, 1 / 60);
      if (edge.solid(body.x, body.y, body.r))
        throw Error("Wall approach penetrated the body");
      if (!contact && edge.run.damageTaken > 0)
        contact = {
          frame,
          distance: Math.hypot(body.x - before.x, body.y - before.y),
        };
    }
    if (
      !contact ||
      contact.distance >= body.r + edge.player.r + 1 ||
      edge.rng.state !== rng
    )
      throw Error("Wall approach failed actual contact");
    return {
      rows,
      sheets,
      wallApproach: {
        seed: edge.run.seed,
        layout: edge.layout.id,
        radius: body.r,
        contact,
        damageTaken: edge.run.damageTaken,
        fullBodyClear: true,
        rngSame: true,
        scope:
          "Controlled actual updateEnemy at 60Hz in the native JS engine; target before real knockback, no body penetration or seeded random consumption. Not real-time public combat.",
      },
    };
  });
}

if (process.argv[1]?.endsWith("observe-layouts.js")) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/");
    const result = await observeLayoutArt(page);
    for (let i = 0; i < result.sheets.length; i++)
      await writeFile(
        `/tmp/echo-layouts-sheet-${i}.png`,
        Buffer.from(result.sheets[i].split(",")[1], "base64"),
      );
    await writeFile(
      "/tmp/echo-layouts-art.json",
      JSON.stringify(
        {
          scope:
            "Controlled native Chromium renderer: 18 authored regional Game shapes and corresponding old seeded shapes at time zero. Full old/new RGBA comparison, outside cover neighborhoods exact; no world mutation during drawing. Contact sheets show actual buffer pixels. This is not an earned expedition or a human enjoyment evaluation.",
          rows: result.rows,
          wallApproach: result.wallApproach,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      JSON.stringify({
        rows: result.rows.length,
        outside: result.rows.reduce((n, r) => n + r.outside, 0),
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
}
