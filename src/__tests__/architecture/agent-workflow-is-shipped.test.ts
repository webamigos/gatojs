// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const skillPath = ".claude/skills/gato-task/SKILL.md";

const readRepoFile = (relative: string): string => {
  const file = path.join(repoRoot, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
};

const frontmatterOf = (content: string): string =>
  content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";

const bodyOf = (content: string): string =>
  content.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");

const descriptionOf = (content: string): string =>
  frontmatterOf(content)
    .match(/^description:[ \t]*(.*)$/m)?.[1]
    ?.trim() ?? "";

const readSettings = () =>
  JSON.parse(readRepoFile(".claude/settings.json")) as {
    extraKnownMarketplaces?: Record<string, { source?: unknown }>;
    enabledPlugins?: Record<string, unknown>;
    hooks?: { PreToolUse?: unknown };
  };

describe("skill gato-task", () => {
  it("istnieje w .claude/skills/gato-task/SKILL.md", () => {
    expect(fs.existsSync(path.join(repoRoot, skillPath))).toBe(true);
  });

  it("frontmatter ma name: gato-task", () => {
    expect(frontmatterOf(readRepoFile(skillPath))).toMatch(
      /^name:[ \t]*gato-task[ \t]*$/m,
    );
  });

  it("frontmatter ma niepusty opis", () => {
    expect(descriptionOf(readRepoFile(skillPath))).not.toBe("");
  });

  it("opisuje kroki w kolejności: testy, faza, recenzja testów, mutacje, bramka, verify, code review", () => {
    const body = bodyOf(readRepoFile(skillPath));
    const steps = [
      "test-writer",
      ".superpowers/phase",
      "test-reviewer",
      "npm run test:mutation:task",
      "npm run test:mutation:gate",
      "npm run verify",
      "wa-code-review",
    ];
    const foundInOrder: string[] = [];
    let cursor = 0;
    for (const step of steps) {
      const index = body.indexOf(step, cursor);
      if (index === -1) {
        break;
      }
      foundInOrder.push(step);
      cursor = index + step.length;
    }
    expect(foundInOrder).toEqual([
      "test-writer",
      ".superpowers/phase",
      "test-reviewer",
      "npm run test:mutation:task",
      "npm run test:mutation:gate",
      "npm run verify",
      "wa-code-review",
    ]);
  });

  it("test-reviewer pojawia się dopiero po test-writer", () => {
    const body = bodyOf(readRepoFile(skillPath));
    const writer = body.indexOf("test-writer");
    expect(writer).toBeGreaterThan(-1);
    expect(body.indexOf("test-reviewer")).toBeGreaterThan(writer);
  });

  it("wymienia fazę `implement` w backtickach", () => {
    expect(bodyOf(readRepoFile(skillPath))).toContain("`implement`");
  });
});

describe(".claude/settings.json", () => {
  it("deklaruje marketplace superpowers z GitHuba obra/superpowers-marketplace", () => {
    expect(
      readSettings().extraKnownMarketplaces?.["superpowers-marketplace"]
        ?.source,
    ).toEqual({ source: "github", repo: "obra/superpowers-marketplace" });
  });

  it("włącza plugin superpowers@superpowers-marketplace wartością true", () => {
    expect(
      readSettings().enabledPlugins?.["superpowers@superpowers-marketplace"],
    ).toBe(true);
  });

  it("nie włącza superpowers z innego marketplace", () => {
    expect(
      readSettings().enabledPlugins?.["superpowers@claude-plugins-official"],
    ).toBeUndefined();
  });

  it("zachowuje hooki block-comments i protect-tests w PreToolUse", () => {
    const preToolUse = JSON.stringify(readSettings().hooks?.PreToolUse ?? null);
    expect(preToolUse).toContain("block-comments.mjs");
    expect(preToolUse).toContain("protect-tests.mjs");
  });
});

describe("agenci testów", () => {
  for (const agent of [
    ".claude/agents/test-writer.md",
    ".claude/agents/test-reviewer.md",
  ]) {
    it(`${agent}: opis wskazuje gato-task`, () => {
      expect(descriptionOf(readRepoFile(agent))).toContain("gato-task");
    });

    it(`${agent}: nie wspomina subagent-driven-development`, () => {
      const content = readRepoFile(agent);
      expect(content).not.toBe("");
      expect(content).not.toContain("subagent-driven-development");
    });
  }
});

describe("instrukcje wskazują gato-task", () => {
  it("AGENTS.md wymienia gato-task", () => {
    expect(readRepoFile("AGENTS.md")).toContain("gato-task");
  });

  it("skill wa-new-module wymienia gato-task", () => {
    expect(readRepoFile(".claude/skills/wa-new-module/SKILL.md")).toContain(
      "gato-task",
    );
  });
});
