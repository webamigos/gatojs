// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const DEFINING_FILE = "src/shared/lib/auth/request-principal.ts";
const ALLOWED_CALLERS: readonly string[] = ["src/app/api/mcp/route.ts"];
const AUTH_DIR = "src/shared/lib/auth";
const ROLES_FILE = "src/shared/lib/auth/roles.ts";

const SINGLE_ORG_GUARD_REASON =
  "a better-auth before hook on /organization/*: it receives the role of the browser session from better-auth and is never reached through the MCP route; the test pins that a request principal does not change its outcome";

const IS_GLOBAL_ADMIN_READERS: ReadonlyMap<
  string,
  { test: string; reason?: string }
> = new Map([
  [
    "src/shared/lib/auth/helpers.ts",
    { test: "src/shared/lib/auth/__tests__/helpers-principal.test.ts" },
  ],
  [
    "src/shared/lib/auth/permissions.ts",
    { test: "src/shared/lib/auth/__tests__/org-context-principal.test.ts" },
  ],
  [
    "src/shared/lib/auth/single-org-guard.ts",
    {
      test: "src/shared/lib/auth/__tests__/single-org-guard-principal.test.ts",
      reason: SINGLE_ORG_GUARD_REASON,
    },
  ],
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];

function isTestFile(relativePath: string): boolean {
  return (
    relativePath.split("/").includes("__tests__") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

function listSourceFiles(root: string, directory: string): string[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  return fs
    .readdirSync(absolute, { recursive: true, encoding: "utf8" })
    .map((entry) => path.posix.join(directory, entry.split(path.sep).join("/")))
    .filter((relativePath) =>
      SOURCE_EXTENSIONS.includes(path.extname(relativePath)),
    )
    .filter((relativePath) => !isTestFile(relativePath))
    .sort();
}

function referencesIdentifier(source: string, identifier: string): boolean {
  return new RegExp(`\\b${identifier}\\b`).test(source);
}

function findUnallowedPrincipalCallers(root: string): string[] {
  return listSourceFiles(root, "src")
    .filter((file) => file !== DEFINING_FILE)
    .filter((file) => !ALLOWED_CALLERS.includes(file))
    .filter((file) =>
      referencesIdentifier(
        fs.readFileSync(path.join(root, file), "utf8"),
        "runWithRequestPrincipal",
      ),
    );
}

function findIsGlobalAdminReaders(root: string): string[] {
  return listSourceFiles(root, AUTH_DIR)
    .filter((file) => file !== ROLES_FILE)
    .filter((file) =>
      referencesIdentifier(
        fs.readFileSync(path.join(root, file), "utf8"),
        "isGlobalAdmin",
      ),
    );
}

function compareReaders(
  readers: readonly string[],
  covered: ReadonlyMap<string, unknown>,
): { missing: string[]; stale: string[] } {
  return {
    missing: readers.filter((reader) => !covered.has(reader)),
    stale: [...covered.keys()].filter((reader) => !readers.includes(reader)),
  };
}

function writeFile(root: string, relativePath: string, content: string) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

const CALLER_SOURCE = `import { runWithRequestPrincipal } from "@/shared/lib/auth/request-principal";\nexport function handle() {\n  return runWithRequestPrincipal(principal, () => 1);\n}\n`;

describe("detektor wywołań runWithRequestPrincipal na fixture", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "request-principal-"));
    writeFile(
      root,
      DEFINING_FILE,
      "export function runWithRequestPrincipal() {}\n",
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("brak wywołań → brak naruszeń", () => {
    writeFile(root, "src/shared/lib/other.ts", "export const x = 1;\n");

    expect(findUnallowedPrincipalCallers(root)).toEqual([]);
  });

  it("wywołanie w trasie MCP jest dozwolone", () => {
    writeFile(root, "src/app/api/mcp/route.ts", CALLER_SOURCE);

    expect(findUnallowedPrincipalCallers(root)).toEqual([]);
  });

  it("wywołanie w innym pliku źródłowym jest naruszeniem", () => {
    writeFile(
      root,
      "src/features/billing/services/commands/a.ts",
      CALLER_SOURCE,
    );
    writeFile(root, "src/app/api/other/route.tsx", CALLER_SOURCE);

    expect(findUnallowedPrincipalCallers(root)).toEqual([
      "src/app/api/other/route.tsx",
      "src/features/billing/services/commands/a.ts",
    ]);
  });

  it("import pod aliasem też jest naruszeniem", () => {
    writeFile(
      root,
      "src/shared/lib/sneaky.ts",
      `import { runWithRequestPrincipal as run } from "@/shared/lib/auth/request-principal";\nexport const go = () => run(p, () => 1);\n`,
    );

    expect(findUnallowedPrincipalCallers(root)).toEqual([
      "src/shared/lib/sneaky.ts",
    ]);
  });

  it("pliki testów są pomijane", () => {
    writeFile(root, "src/shared/lib/auth/__tests__/x.test.ts", CALLER_SOURCE);
    writeFile(root, "src/features/a/b.test.ts", CALLER_SOURCE);
    writeFile(root, "src/features/a/c.spec.tsx", CALLER_SOURCE);

    expect(findUnallowedPrincipalCallers(root)).toEqual([]);
  });

  it("odczyt currentRequestPrincipal nie jest wywołaniem runWithRequestPrincipal", () => {
    writeFile(
      root,
      "src/shared/lib/auth/org-context.ts",
      `import { currentRequestPrincipal } from "./request-principal";\nexport const p = () => currentRequestPrincipal();\n`,
    );

    expect(findUnallowedPrincipalCallers(root)).toEqual([]);
  });
});

describe("runWithRequestPrincipal w repozytorium", () => {
  it("wywołuje go tylko src/app/api/mcp/route.ts", () => {
    expect(findUnallowedPrincipalCallers(repoRoot)).toEqual([]);
  });
});

describe("detektor czytelników isGlobalAdmin na fixture", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "global-admin-readers-"));
    writeFile(
      root,
      ROLES_FILE,
      "export function isGlobalAdmin(role: unknown) { return role === 'admin'; }\n",
    );
    writeFile(
      root,
      "src/shared/lib/auth/helpers.ts",
      `import { isGlobalAdmin } from "./roles";\nexport const a = (r: string) => isGlobalAdmin(r);\n`,
    );
    writeFile(root, "src/shared/lib/auth/plain.ts", "export const b = 1;\n");
    writeFile(
      root,
      "src/shared/lib/auth/__tests__/helpers.test.ts",
      `import { isGlobalAdmin } from "../roles";\n`,
    );
    writeFile(
      root,
      "src/shared/lib/modules/nav.ts",
      `import { isGlobalAdmin } from "@/shared/lib/auth/roles";\n`,
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("znajduje czytelnika w katalogu auth, pomija roles.ts, testy i pliki spoza katalogu", () => {
    expect(findIsGlobalAdminReaders(root)).toEqual([
      "src/shared/lib/auth/helpers.ts",
    ]);
  });

  it("czytelnik w podkatalogu auth też się liczy", () => {
    writeFile(
      root,
      "src/shared/lib/auth/nested/guard.ts",
      `import { isGlobalAdmin as admin } from "../roles";\nexport const g = admin;\n`,
    );

    expect(findIsGlobalAdminReaders(root)).toEqual([
      "src/shared/lib/auth/helpers.ts",
      "src/shared/lib/auth/nested/guard.ts",
    ]);
  });

  it("nowy czytelnik bez wpisu w mapie → missing", () => {
    writeFile(
      root,
      "src/shared/lib/auth/new-guard.ts",
      `import { isGlobalAdmin } from "./roles";\nexport const n = isGlobalAdmin;\n`,
    );

    expect(
      compareReaders(
        findIsGlobalAdminReaders(root),
        new Map([["src/shared/lib/auth/helpers.ts", {}]]),
      ),
    ).toEqual({ missing: ["src/shared/lib/auth/new-guard.ts"], stale: [] });
  });

  it("wpis w mapie bez czytelnika → stale", () => {
    expect(
      compareReaders(
        findIsGlobalAdminReaders(root),
        new Map([
          ["src/shared/lib/auth/helpers.ts", {}],
          ["src/shared/lib/auth/plain.ts", {}],
        ]),
      ),
    ).toEqual({ missing: [], stale: ["src/shared/lib/auth/plain.ts"] });
  });
});

describe("czytelnicy isGlobalAdmin w src/shared/lib/auth", () => {
  it("każdy czytelnik ma wpis w mapie i żaden wpis nie jest nieaktualny", () => {
    expect(
      compareReaders(
        findIsGlobalAdminReaders(repoRoot),
        IS_GLOBAL_ADMIN_READERS,
      ),
    ).toEqual({ missing: [], stale: [] });
  });

  it.each([...IS_GLOBAL_ADMIN_READERS])(
    "%s ma test przypadku principala, który importuje ten plik",
    (reader, coverage) => {
      const testPath = path.join(repoRoot, coverage.test);
      expect(fs.existsSync(testPath)).toBe(true);
      const source = fs.readFileSync(testPath, "utf8");
      const moduleName = path.basename(reader, ".ts");

      expect(source).toMatch(/\brunWithRequestPrincipal\b/);
      expect(source).toMatch(
        new RegExp(
          `from "(\\.\\./|@/shared/lib/auth/)${moduleName.replace(/[-]/g, "\\-")}"`,
        ),
      );
    },
  );

  it("single-org-guard.ts nie czyta principala żądania", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "src/shared/lib/auth/single-org-guard.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/request-principal|currentRequestPrincipal/);
  });
});
