import { readdirSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { gamePort, gameURL } from "./tests/browser/server-url.js";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: gameURL,
    viewport: { width: 1200, height: 850 },
    trace: "retain-on-failure",
  },
  reporter: "list",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    // The bundled WebKit stalls after navigation 64 even on script-free HTML.
    // Each file gets a fresh browser; all discovered suites retain their tests.
    ...readdirSync(new URL("./tests/browser/", import.meta.url))
      .filter((file) => file.endsWith(".spec.js"))
      .sort()
      .map((file) => ({
        name: `webkit-${file.replace(".spec.js", "")}`,
        testMatch: `**/${file}`,
        use: { browserName: "webkit" },
      })),
  ],
  webServer: {
    command: `npm run dev -- --port ${gamePort} --strictPort`,
    url: gameURL,
    reuseExistingServer: true,
    timeout: 15000,
  },
});
