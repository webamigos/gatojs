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
    it("kit/kit.json declares README.md, src/theme.css and the legal config and content as seed files", () => {
      expect(readJson("kit/kit.json").seedFiles).toEqual([
        "README.md",
        "src/theme.css",
        "src/features/legal/legal.config.ts",
        "src/features/legal/content/index.ts",
        "src/features/legal/content/terms.pl.tsx",
        "src/features/legal/content/terms.en.tsx",
        "src/features/legal/content/privacy.pl.tsx",
        "src/features/legal/content/privacy.en.tsx",
      ]);
    });

    it("kit/modules/legal.json owns the legal seed files through its glob", () => {
      expect(readJson("kit/modules/legal.json").files).toContain(
        "src/features/legal/**",
      );
    });

    it("every legal seed file exists in the kit", () => {
      for (const seed of [
        "src/features/legal/legal.config.ts",
        "src/features/legal/content/index.ts",
        "src/features/legal/content/terms.pl.tsx",
        "src/features/legal/content/terms.en.tsx",
        "src/features/legal/content/privacy.pl.tsx",
        "src/features/legal/content/privacy.en.tsx",
      ]) {
        expect(fs.existsSync(path.join(repoRoot, seed)), seed).toBe(true);
      }
    });

    it("kit/modules/core.json owns src/theme.css", () => {
      expect(readJson("kit/modules/core.json").files).toContain(
        "src/theme.css",
      );
    });
  },
);
