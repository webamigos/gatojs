import { defineConfig, devices } from "@playwright/test";
import { appEnv, baseUrlFor, E2E_PORTS } from "./e2e/env";

const servers = [
  { port: E2E_PORTS.core, multiOrg: false, publicSignup: false },
  { port: E2E_PORTS.multiOrg, multiOrg: true, publicSignup: true },
];

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    locale: "pl",
  },
  projects: [
    {
      name: "core-auth",
      testMatch: "**/core-auth.spec.ts",
      use: { baseURL: baseUrlFor(E2E_PORTS.core) },
    },
    {
      name: "multi-org",
      testMatch: "**/multi-org.spec.ts",
      use: { baseURL: baseUrlFor(E2E_PORTS.multiOrg) },
    },
  ],
  webServer: servers.map((server) => ({
    command: "node .next/standalone/server.js",
    url: `${baseUrlFor(server.port)}/sign-in`,
    env: appEnv(server),
    reuseExistingServer: false,
    timeout: 120_000,
  })),
});
