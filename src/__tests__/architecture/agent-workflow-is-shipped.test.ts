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

const numberedStepsOf = (content: string) =>
  bodyOf(content)
    .split(/^(?=\d+\. )/m)
    .filter((chunk) => /^\d+\. /.test(chunk))
    .map((chunk) => ({
      number: Number(chunk.slice(0, chunk.indexOf("."))),
      text: chunk,
    }));

const firstStepContaining = (content: string, token: string) =>
  numberedStepsOf(content).find((step) => step.text.includes(token))?.number ??
  null;

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

  it("opisuje kroki w kolejności: testy, faza w .gato/phase, recenzja testów, mutacje, bramka, verify, code review", () => {
    const body = bodyOf(readRepoFile(skillPath));
    const steps = [
      "test-writer",
      ".gato/phase",
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
      ".gato/phase",
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

  it("ma kroki ponumerowane kolejno od 1 do 7", () => {
    expect(
      numberedStepsOf(readRepoFile(skillPath)).map((step) => step.number),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("każde kluczowe słowo pojawia się pierwszy raz we właściwym kroku", () => {
    const content = readRepoFile(skillPath);
    expect({
      testWriter: firstStepContaining(content, "test-writer"),
      implementPhase: firstStepContaining(content, "`implement`"),
      phaseFile: firstStepContaining(content, ".gato/phase"),
      unlock: firstStepContaining(content, "rm .gato/phase"),
      testReviewer: firstStepContaining(content, "test-reviewer"),
      mutationTask: firstStepContaining(content, "npm run test:mutation:task"),
      mutationGate: firstStepContaining(content, "npm run test:mutation:gate"),
      verify: firstStepContaining(content, "npm run verify"),
      codeReview: firstStepContaining(content, "wa-code-review"),
    }).toEqual({
      testWriter: 2,
      implementPhase: 3,
      phaseFile: 3,
      unlock: 5,
      testReviewer: 6,
      mutationTask: 6,
      mutationGate: 6,
      verify: 7,
      codeReview: 7,
    });
  });

  it("w kroku bramek npm run verify stoi przed wa-code-review", () => {
    const gates =
      numberedStepsOf(readRepoFile(skillPath)).find((step) => step.number === 7)
        ?.text ?? "";
    const verify = gates.indexOf("npm run verify");
    expect(verify).toBeGreaterThan(-1);
    expect(gates.indexOf("wa-code-review")).toBeGreaterThan(verify);
  });

  it("wymienia fazę `implement` w backtickach", () => {
    expect(bodyOf(readRepoFile(skillPath))).toContain("`implement`");
  });

  it("krok blokady zapisuje `implement` do .gato/phase poleceniem mkdir -p .gato", () => {
    const lock =
      numberedStepsOf(readRepoFile(skillPath)).find((step) => step.number === 3)
        ?.text ?? "";
    expect(lock).toContain("mkdir -p .gato");
    expect(lock).toContain("> .gato/phase");
  });

  it("krok odblokowania usuwa .gato/phase", () => {
    const unlock =
      numberedStepsOf(readRepoFile(skillPath)).find((step) => step.number === 5)
        ?.text ?? "";
    expect(unlock).toContain("rm .gato/phase");
  });

  it("treść skilla nie wspomina już ścieżki .superpowers", () => {
    const body = bodyOf(readRepoFile(skillPath));
    expect(body).not.toBe("");
    expect(body).not.toContain(".superpowers");
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

  it("hooki block-comments i protect-tests działają na matcherze Edit|Write", () => {
    const entries = (readSettings().hooks?.PreToolUse ?? []) as Array<{
      matcher?: unknown;
    }>;
    const guarded = entries.filter((entry) => {
      const text = JSON.stringify(entry);
      return (
        text.includes("block-comments.mjs") &&
        text.includes("protect-tests.mjs")
      );
    });
    expect(guarded.map((entry) => entry.matcher)).toEqual(["Edit|Write"]);
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
