import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGameServer } from "../scripts/serve-browser.js";

test("展開したブラウザ配布を独立したURLとサブディレクトリで配信する", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "echo-loom-server-"));
  const web = path.join(directory, "web");
  await mkdir(path.join(web, "assets"), { recursive: true });
  await writeFile(path.join(web, "index.html"), "<p>残響の灯台</p>");
  await writeFile(
    path.join(web, "assets/game.js"),
    "export const game = true;",
  );
  await writeFile(path.join(web, "manifest.webmanifest"), '{"scope":"./"}');
  await writeFile(
    path.join(web, "THIRD-PARTY-NOTICES.txt"),
    "MIT License\n灯り",
  );
  await writeFile(path.join(directory, "private.txt"), "outside");
  await writeFile(path.join(web, ".private.txt"), "hidden");
  await symlink(
    path.join(directory, "private.txt"),
    path.join(web, "linked.txt"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const base of ["/", "/echo-loom/"]) {
    const server = await createGameServer(web, base);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      const main = await fetch(origin + base);
      assert.equal(main.status, 200);
      assert.equal(await main.text(), "<p>残響の灯台</p>");
      const javascript = await fetch(origin + base + "assets/game.js?cache=1");
      assert.equal(
        javascript.headers.get("content-type"),
        "text/javascript; charset=utf-8",
      );
      assert.equal(await javascript.text(), "export const game = true;");
      assert.equal(
        (await fetch(origin + base + "manifest.webmanifest")).headers.get(
          "content-type",
        ),
        "application/manifest+json; charset=utf-8",
      );
      const head = await fetch(origin + base + "THIRD-PARTY-NOTICES.txt", {
        method: "HEAD",
      });
      assert.equal(head.status, 200);
      assert.equal(
        Number(head.headers.get("content-length")),
        Buffer.byteLength("MIT License\n灯り"),
      );
      assert.equal(await head.text(), "");
      for (const suffix of [
        ".private.txt",
        "linked.txt",
        "..%2fprivate.txt",
        "assets/",
        "missing.html",
      ])
        assert.equal((await fetch(origin + base + suffix)).status, 404, suffix);
      assert.equal((await fetch(origin + base + "%E0%A4%A")).status, 400);
      assert.equal(
        (await fetch(origin + base, { method: "POST" })).status,
        405,
      );
      if (base !== "/") assert.equal((await fetch(origin + "/")).status, 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("配布本体がなくても別の場所のファイルを配信しない", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "echo-loom-missing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(createGameServer(directory), /web\/index.html/);
  await assert.rejects(createGameServer(directory, "/../"), /配信先/);
});
