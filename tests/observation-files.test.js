import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const execute = promisify(execFile);

async function checkout(t) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "echo-observations-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "tests/fixtures/reference"), { recursive: true });
  await mkdir(path.join(root, "tests/fixtures/observations"));
  const modulePath = path.join(root, "scripts/observation-files.mjs");
  await copyFile(
    new URL("../scripts/observation-files.js", import.meta.url),
    modulePath,
  );
  const run = async (script, artifactDirectory = "") => {
    const { stdout } = await execute(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
        import * as files from ${JSON.stringify(pathToFileURL(modulePath).href)};
        import { readFile, writeFile } from "node:fs/promises";
        ${script}
      `,
      ],
      {
        cwd: tmpdir(),
        env: { ...process.env, ECHO_ARTIFACT_DIR: artifactDirectory },
      },
    );
    return JSON.parse(stdout);
  };
  return { root, run };
}

test("過去の作業ディレクトリなしで基準入力を読み、生成した観察を優先する", async (t) => {
  const { root, run } = await checkout(t);
  await writeFile(
    path.join(root, "tests/fixtures/reference/earned.json"),
    "reference",
  );
  await writeFile(
    path.join(root, "tests/fixtures/observations/earned.json"),
    "historical",
  );
  await writeFile(
    path.join(root, "tests/fixtures/observations/renderer.js"),
    "renderer",
  );
  const result = await run(`
    const reference = await readFile(await files.observationInputPath("earned.json"), "utf8");
    const historical = await readFile(await files.observationInputPath("renderer.js"), "utf8");
    await writeFile(files.observationPath("earned.json"), "generated");
    const generated = await readFile(await files.observationInputPath("earned.json"), "utf8");
    console.log(JSON.stringify({ directory: files.observationDirectory, reference, historical, generated }));
  `);
  assert.deepEqual(result, {
    directory: path.join(root, "test-results/observations"),
    reference: "reference",
    historical: "renderer",
    generated: "generated",
  });
});

test("指定した保存先を作成し、入出力の両方に使う", async (t) => {
  const { root, run } = await checkout(t);
  const destination = path.join(root, "custom/nested");
  const result = await run(
    `
    await writeFile(files.observationPath("earned.json"), "custom");
    const input = await files.observationInputPath("earned.json");
    console.log(JSON.stringify({ input, bytes: await readFile(input, "utf8") }));
  `,
    destination,
  );
  assert.deepEqual(result, {
    input: path.join(destination, "earned.json"),
    bytes: "custom",
  });
});

test("入力がない場合は次の操作を示し、ファイルシステムのエラーは隠さない", async (t) => {
  const { run } = await checkout(t);
  const result = await run(`
    let missing;
    try { await files.observationInputPath("missing.json"); }
    catch (error) { missing = error.message; }
    await writeFile(files.observationPath("not-a-directory"), "file");
    let code;
    try { await files.observationInputPath("not-a-directory/earned.json"); }
    catch (error) { code = error.code; }
    console.log(JSON.stringify({ missing, code }));
  `);
  assert.match(result.missing, /missing\.json.*生成.*ECHO_ARTIFACT_DIR/);
  assert.equal(result.code, "ENOTDIR");
});
