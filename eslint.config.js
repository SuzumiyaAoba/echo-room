import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Historical implementations are comparison fixtures, not maintained code.
  globalIgnores([
    "dist/**",
    "release/**",
    ".mdxr/**",
    "test-results/**",
    "playwright-report/**",
    "tests/fixtures/**",
  ]),
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022 },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "no-var": "error",
      "no-invalid-this": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  {
    files: ["src/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["scripts/**/*.js", "tests/**/*.js", "*.config.js"],
    // Playwright's page callbacks execute in the browser; the harness uses Node.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]);
