import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { integrationDatabaseUrl } from "@/test/integration/database-url";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const script = path.join(import.meta.dirname, "fixtures/prisma-disconnect.ts");

function runScript(): Promise<{
  code: number | null;
  ms: number;
  stderr: string;
}> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", script], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: integrationDatabaseUrl() },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ code, ms: Date.now() - started, stderr });
    });
  });
}

describe("prisma", () => {
  it("a script that disconnects exits on its own within 10 seconds", async () => {
    const result = await runScript();

    expect(result.code, result.stderr).toBe(0);
    expect(result.ms).toBeLessThan(10_000);
  }, 60_000);
});
