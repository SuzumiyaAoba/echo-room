import http from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export async function createGameServer(directory, base = "/") {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))
    throw new Error("配信先は / または /echo-loom/ のように指定してください。");
  const assets = new Map();
  async function collect(folder, prefix = "") {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const name = prefix + entry.name;
      if (entry.isDirectory())
        await collect(path.join(folder, entry.name), name + "/");
      else if (entry.isFile() && types[path.extname(name)])
        assets.set(name, await readFile(path.join(folder, entry.name)));
    }
  }
  await collect(directory);
  if (!assets.has("index.html"))
    throw new Error(
      "web/index.html がありません。配布フォルダーをまとめて展開してください。",
    );
  return http.createServer((request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    const name = pathname === base ? "index.html" : pathname.slice(base.length);
    const bytes = pathname.startsWith(base) ? assets.get(name) : null;
    if (!bytes) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(name)],
      "Content-Length": bytes.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : bytes);
  });
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const options = {
      port: 4173,
      base: "/",
      root: fileURLToPath(new URL("./web/", import.meta.url)),
    };
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i];
      const value = process.argv[i + 1];
      if (!["--port", "--base", "--root"].includes(key) || value === undefined)
        throw new Error(
          "使い方: node start.mjs [--port 4173] [--base /echo-loom/]",
        );
      options[key.slice(2)] = key === "--port" ? Number(value) : value;
    }
    if (
      !Number.isInteger(options.port) ||
      options.port < 0 ||
      options.port > 65535
    )
      throw new Error("ポートは0から65535の整数を指定してください。");
    const server = await createGameServer(
      path.resolve(options.root),
      options.base,
    );
    server.on("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? `${options.port}は使われています。前に起動したゲームを終了するか、--port 4174 を指定してください。`
          : error.message,
      );
      process.exitCode = 1;
    });
    server.listen(options.port, "127.0.0.1", () => {
      console.log(
        `残響の灯台 — ECHO LOOM\nhttp://127.0.0.1:${server.address().port}${options.base}\n終了は Ctrl+C。記録はこのURLのブラウザに残ります。`,
      );
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
