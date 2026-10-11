import { readdirSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
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
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 15000,
  },
});
