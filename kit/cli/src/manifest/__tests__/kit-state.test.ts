import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installedModules, readKitState, writeKitState } from "../kit-state.js";
import { moduleManifestSchema } from "../schema.js";
import type { KitState } from "../schema.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "wa-kit-state-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function stateWith(names: string[]): KitState {
  return {
    kitVersion: "0.0.0",
    modules: Object.fromEntries(
      names.map((name) => [
        name,
        {
          version: "1.0.0",
          manifest: moduleManifestSchema.parse({
            name,
            version: "1.0.0",
            description: name,
          }),
          files: { [`src/features/${name}/module.ts`]: "a".repeat(64) },
        },
      ]),
    ),
  };
}

describe("kit state", () => {
  it("readKitState zgłasza brak pliku z nazwą katalogu", async () => {
    await expect(readKitState(tmp)).rejects.toThrow(
      `Brak .wa/kit.json w ${tmp}`,
    );
  });

  it("writeKitState + readKitState round-trip, moduły posortowane", async () => {
    await writeKitState(tmp, stateWith(["uploads", "core", "api-keys"]));
    const raw = await readFile(join(tmp, ".wa/kit.json"), "utf8");
    expect(Object.keys(JSON.parse(raw).modules)).toEqual([
      "api-keys",
      "core",
      "uploads",
    ]);
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain('\n  "kitVersion"');
    expect(
      installedModules(await readKitState(tmp)).map((m) => m.name),
    ).toEqual(["core", "api-keys", "uploads"]);
  });

  it("readKitState odrzuca niepoprawny plik", async () => {
    await writeKitState(tmp, stateWith(["core"]));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(tmp, ".wa/kit.json"),
      JSON.stringify({ kitVersion: 1 }),
    );
    await expect(readKitState(tmp)).rejects.toThrow();
  });
});
