import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "server-only": path.resolve(dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["./src/test/integration/global-setup.ts"],
    setupFiles: ["./src/test/integration/setup-env.ts"],
    fileParallelism: false,
    clearMocks: true,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
