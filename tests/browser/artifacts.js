import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Generated reports live with test output; reference inputs are versioned.
export const artifacts = "test-results/artifacts";
await mkdir(artifacts, { recursive: true });

export const artifactPath = (name) => `${artifacts}/${name}`;

export const fixturePath = (name) =>
  fileURLToPath(new URL(`../fixtures/reference/${name}`, import.meta.url));
