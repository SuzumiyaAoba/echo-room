import { readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve("dist");
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (e) =>
        e.isDirectory()
          ? files(path.join(dir, e.name))
          : path.join(dir, e.name),
      ),
    )
  ).flat();
}
await copyFile(
  "node_modules/vite/LICENSE.md",
  path.join(root, "THIRD-PARTY-NOTICES.txt"),
);
const assets = (await files(root))
  .filter((f) => !f.endsWith("sw.js"))
  .map((f) => path.relative(root, f).replaceAll(path.sep, "/"))
  .sort();
const hash = createHash("sha256");
for (const file of assets) hash.update(await readFile(path.join(root, file)));
const version = hash.digest("hex").slice(0, 12);
const worker = `const CACHE = 'echo-loom-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(p => new URL(p, self.registration.scope).href))).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('echo-loom-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url), scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).catch(() => request.mode === 'navigate' ? caches.match(new URL('index.html', scope).href) : Response.error())));
});
`;
await writeFile(path.join(root, "sw.js"), worker);
console.log(`Offline build ${version}: ${assets.length} assets precached.`);
