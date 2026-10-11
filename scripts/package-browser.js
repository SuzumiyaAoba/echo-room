import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import path from "node:path";

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
};

function archive(entries) {
  const records = [],
    directory = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const filename = Buffer.from(name),
      data = deflateRawSync(bytes),
      crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    header.copy(central, 6, 4, 30);
    central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    records.push(header, filename, data);
    offset += header.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, central, end]);
}

const version = JSON.parse(await readFile("package.json", "utf8")).version;
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version))
  throw new Error("配布の版番号が不正です。");
const folder = `echo-loom-${version}-browser`,
  output = path.join("release", folder);
const guide = await readFile("resources/PLAY.html");
const guideReference = JSON.parse(
  await readFile("resources/player-guide.json", "utf8"),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (
  sha(guide) !== guideReference.htmlSha256 ||
  sha(await readFile("resources/player-guide.mdx")) !==
    guideReference.sourceSha256
)
  throw new Error(
    "プレイヤー向け案内が書き出した内容と一致しません。案内を再生成してください。",
  );
const worker = await readFile("dist/sw.js", "utf8");
const cache = worker.match(/const CACHE = '([^']+)'/)[1];
const webFiles = JSON.parse(worker.match(/const ASSETS = (\[[^;]+\]);/)[1])
  .concat("sw.js")
  .sort();
const entries = await Promise.all(
  webFiles.map(async (name) => ({
    name: "web/" + name,
    bytes: await readFile(path.join("dist", name)),
  })),
);
entries.push(
  { name: "PLAY.html", bytes: guide },
  { name: "start.mjs", bytes: await readFile("scripts/serve-browser.js") },
);
const manifest = {
  name: "残響の灯台 — ECHO LOOM",
  version,
  edition: "browser",
  cache,
  guideSourceSha256: guideReference.sourceSha256,
  files: entries.map(({ name, bytes }) => ({
    path: name,
    bytes: bytes.length,
    sha256: sha(bytes),
  })),
};
entries.push({
  name: "BUILD.json",
  bytes: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
});
await mkdir("release", { recursive: true });
await rm(output, { recursive: true, force: true });
for (const { name, bytes } of entries) {
  const target = path.join(output, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const zip = archive(
  entries.map((entry) => ({ ...entry, name: folder + "/" + entry.name })),
);
await writeFile(output + ".zip", zip);
await writeFile(output + ".sha256", sha(zip) + "  " + folder + ".zip\n");
console.log(
  JSON.stringify({
    path: output + ".zip",
    bytes: zip.length,
    sha256: sha(zip),
    version,
    cache,
    files: entries.length,
  }),
);
