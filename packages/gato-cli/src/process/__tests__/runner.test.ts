import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDirs } from "../../__tests__/helpers.js";
import { spawnRunner } from "../runner.js";

let cwd: string;

beforeEach(async () => {
  cwd = await makeTempDir();
});

afterEach(async () => {
  await removeTempDirs();
});

describe("spawnRunner", () => {
  it("kod 0 kończy się bez błędu i działa w podanym katalogu", async () => {
    await spawnRunner(
      "node",
      ["-e", "require('fs').writeFileSync('ślad.txt','1')"],
      cwd,
    );
    expect(existsSync(join(cwd, "ślad.txt"))).toBe(true);
  });

  it("kod różny od 0 zgłasza polecenie z argumentami i kodem", async () => {
    await expect(
      spawnRunner("node", ["-e", "process.exit(3)"], cwd),
    ).rejects.toThrow("node -e process.exit(3) exited with code 3");
  });

  it("nieistniejące polecenie odrzuca obietnicę", async () => {
    await expect(
      spawnRunner("wa-nie-ma-takiego-polecenia", [], cwd),
    ).rejects.toThrow();
  });
});
