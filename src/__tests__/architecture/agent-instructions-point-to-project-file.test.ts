// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const readRepoFile = (relative: string): string =>
  fs.readFileSync(path.join(repoRoot, relative), "utf8");

describe("agent instructions point to AGENTS.project.md", () => {
  it.each(["AGENTS.md", "CLAUDE.md"])(
    "%s mentions AGENTS.project.md",
    (file) => {
      expect(readRepoFile(file)).toContain("AGENTS.project.md");
    },
  );
});
