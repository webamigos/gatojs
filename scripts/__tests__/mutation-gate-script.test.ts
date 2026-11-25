// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const tsx = path.join(repoRoot, "node_modules/.bin/tsx");
const script = path.join(repoRoot, "scripts/mutation-gate.ts");

const TIMEOUT = 60_000;
const SOURCE = "const a = 1;\nreturn a > 0;";

const survivingCondition = {
  id: "1",
  mutatorName: "ConditionalExpression",
  replacement: "true",
  status: "Survived",
  location: { start: { line: 2, column: 8 }, end: { line: 2, column: 13 } },
};

const projectFileReport = {
  files: {
    "src/project/x.ts": { source: SOURCE, mutants: [survivingCondition] },
  },
};

const gatoAndProjectFileReport = {
  files: {
    "src/shared/lib/auth/x.ts": {
      source: SOURCE,
      mutants: [survivingCondition],
    },
    "src/project/x.ts": { source: SOURCE, mutants: [survivingCondition] },
  },
};

const gatoAllowed = {
  file: "src/shared/lib/auth/x.ts",
  mutator: "ConditionalExpression",
  original: "a > 0",
  replacement: "true",
  reason: "covered by the gato suite",
};

const projectAllowed = {
  file: "src/project/x.ts",
  mutator: "ConditionalExpression",
  original: "a > 0",
  replacement: "true",
  reason: "covered by the project suite",
};

let workDir: string;

const writeJson = (name: string, value: unknown) => {
  fs.writeFileSync(path.join(workDir, name), JSON.stringify(value));
};

const runGate = (reportValue: unknown) => {
  writeJson("report.json", reportValue);
  const result = spawnSync(tsx, [script, path.join(workDir, "report.json")], {
    cwd: workDir,
    encoding: "utf8",
    timeout: TIMEOUT,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-gate-script-"));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("scripts/mutation-gate.ts with mutation-gate.project.json", () => {
  it(
    "exits 1 naming mutation-gate.project.json when its critical is a string",
    () => {
      writeJson("mutation-gate.json", {
        critical: ["src/shared/lib/auth/"],
        allowed: [],
      });
      writeJson("mutation-gate.project.json", { critical: "src/" });

      const result = runGate(projectFileReport);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid mutation-gate.project.json: ");
    },
    TIMEOUT,
  );

  it(
    "prints the config error message without a stack trace",
    () => {
      writeJson("mutation-gate.json", {
        critical: ["src/shared/lib/auth/"],
        allowed: [],
      });
      writeJson("mutation-gate.project.json", { critical: "src/" });

      const result = runGate(projectFileReport);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("mutation-gate.project.json");
      expect(result.stderr).not.toMatch(/^\s+at /m);
    },
    TIMEOUT,
  );

  it(
    "exits 1 naming mutation-gate.project.json when it is not JSON",
    () => {
      writeJson("mutation-gate.json", {
        critical: ["src/shared/lib/auth/"],
        allowed: [],
      });
      fs.writeFileSync(path.join(workDir, "mutation-gate.project.json"), "{");

      const result = runGate(projectFileReport);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid mutation-gate.project.json: ");
    },
    TIMEOUT,
  );

  it(
    "exits 1 naming mutation-gate.json when Gato's config has an invalid shape",
    () => {
      writeJson("mutation-gate.json", { critical: "src/" });

      const result = runGate(projectFileReport);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid mutation-gate.json: ");
    },
    TIMEOUT,
  );

  it(
    "passes when the project's allowed covers a surviving mutant in a project critical path",
    () => {
      writeJson("mutation-gate.json", {
        critical: ["src/shared/lib/auth/"],
        allowed: [],
      });
      writeJson("mutation-gate.project.json", {
        critical: ["src/project/"],
        allowed: [projectAllowed],
      });

      const result = runGate(projectFileReport);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Mutation gate: OK");
    },
    TIMEOUT,
  );

  it(
    "does not check the project path and passes when there is no project file",
    () => {
      writeJson("mutation-gate.json", {
        critical: ["src/shared/lib/auth/"],
        allowed: [],
      });

      const result = runGate(projectFileReport);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Mutation gate: OK");
    },
    TIMEOUT,
  );

  it(
    "exits 1 naming the mutant in a project critical path without an allowed entry",
    () => {
      writeJson("mutation-gate.json", {
        critical: ["src/shared/lib/auth/"],
        allowed: [],
      });
      writeJson("mutation-gate.project.json", { critical: ["src/project/"] });

      const result = runGate(projectFileReport);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Untested mutant in a critical file: src/project/x.ts:2",
      );
      expect(result.stderr).toContain("ConditionalExpression");
    },
    TIMEOUT,
  );

  it(
    "keeps a Gato-allowed mutant allowed when the project file has its own allowed list",
    () => {
      writeJson("mutation-gate.json", {
        critical: ["src/shared/lib/auth/"],
        allowed: [gatoAllowed],
      });
      writeJson("mutation-gate.project.json", {
        critical: ["src/project/"],
        allowed: [projectAllowed],
      });

      const result = runGate(gatoAndProjectFileReport);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Mutation gate: OK");
    },
    TIMEOUT,
  );

  it(
    "reports an uncovered Gato critical mutant while the project's allowed covers only its own file",
    () => {
      writeJson("mutation-gate.json", {
        critical: ["src/shared/lib/auth/"],
        allowed: [],
      });
      writeJson("mutation-gate.project.json", {
        critical: ["src/project/"],
        allowed: [projectAllowed],
      });

      const result = runGate(gatoAndProjectFileReport);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Untested mutant in a critical file: src/shared/lib/auth/x.ts:2",
      );
      expect(result.stderr).not.toContain("src/project/x.ts:2");
    },
    TIMEOUT,
  );
});
