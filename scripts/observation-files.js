import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const observationDirectory = path.resolve(
  process.env.ECHO_ARTIFACT_DIR ||
    path.join(projectRoot, "test-results/observations"),
);
await mkdir(observationDirectory, { recursive: true });

export const observationPath = (name) => path.join(observationDirectory, name);

// Prefer a newly earned/exported observation. Frozen references make the
// historical comparisons reproducible on a checkout without local reports.
export async function observationInputPath(name) {
  const candidates = [
    observationPath(name),
    ...["reference", "observations"].map((directory) =>
      path.join(projectRoot, "tests/fixtures", directory, name),
    ),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    `観察入力 ${name} が見つかりません。先に対応する観察を生成するか、ECHO_ARTIFACT_DIRで入力のあるディレクトリを指定してください。`,
  );
}
