import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const SHARED_EXCLUDE = [
  "**/node_modules/**",
  "**/*.integration.test.ts",
  "docs/**",
  ".superpowers/**",
  ".stryker-tmp/**",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "server-only": path.resolve(dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    clearMocks: true,
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "jsdom",
          include: [
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
            "scripts/**/*.test.ts",
            "e2e/**/*.test.ts",
          ],
          exclude: [...SHARED_EXCLUDE, "packages/**", "kit/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "packages",
          environment: "node",
          include: ["packages/*/src/**/*.test.ts"],
          exclude: [
            ...SHARED_EXCLUDE,
            "packages/gato-cli/**",
            "packages/create-gato-app/**",
          ],
        },
      },
    ],
  },
});
