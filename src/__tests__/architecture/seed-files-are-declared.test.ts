// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const readJson = (relative: string) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8")) as {
    seedFiles?: unknown;
    files?: unknown;
  };

describe.runIf(fs.existsSync(path.join(repoRoot, "kit/kit.json")))(
  "seed files in the kit",
  () => {
    it("kit/kit.json declares README.md and src/theme.css as seed files", () => {
      expect(readJson("kit/kit.json").seedFiles).toEqual([
        "README.md",
        "src/theme.css",
      ]);
    });

    it("kit/modules/core.json owns src/theme.css", () => {
      expect(readJson("kit/modules/core.json").files).toContain(
        "src/theme.css",
      );
    });
  },
);
