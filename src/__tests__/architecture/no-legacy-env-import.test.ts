// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listFiles } from "../../../scripts/lib/architecture/repo-files";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const THIS_FILE = "src/__tests__/architecture/no-legacy-env-import.test.ts";

const TOOL_PACKAGE_DIRS = ["packages/gato-cli/", "packages/create-gato-app/"];

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

const LEGACY_ENV_SPECIFIER = /(["'`])@\/shared\/lib\/env(\/[^"'`]*)?\1/;

function referencesLegacyEnv(source: string): boolean {
  return LEGACY_ENV_SPECIFIER.test(source);
}

function scannedFiles(): string[] {
  const accept = (repoPath: string) =>
    SOURCE_FILE.test(repoPath) &&
    repoPath !== THIS_FILE &&
    !TOOL_PACKAGE_DIRS.some((dir) => repoPath.startsWith(dir));
  const packageSources = fs
    .readdirSync(path.join(repoRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      listFiles(repoRoot, `packages/${entry.name}/src`, accept),
    );
  return [
    ...listFiles(repoRoot, "src", accept),
    ...listFiles(repoRoot, "scripts", accept),
    ...listFiles(repoRoot, "e2e", accept),
    ...packageSources,
  ];
}

describe("referencesLegacyEnv", () => {
  it.each([
    'import { env } from "@/shared/lib/env";',
    "import { checkEnv } from '@/shared/lib/env';",
    'export * from "@/shared/lib/env";',
    'const mod = await import("@/shared/lib/env");',
    'vi.mock("@/shared/lib/env", () => ({ env: {} }));',
    'import { x } from "@/shared/lib/env/extra";',
  ])("reports %j", (source) => {
    expect(referencesLegacyEnv(source)).toBe(true);
  });

  it.each([
    'import { env } from "@/env";',
    'import { checkEnv } from "@gatojs/env";',
    'import { b } from "@/shared/lib/environment";',
    'import { c } from "@/shared/lib/envs";',
    "const path = 'src/shared/lib/env.ts';",
  ])("does not report %j", (source) => {
    expect(referencesLegacyEnv(source)).toBe(false);
  });
});

describe("the legacy env module is gone", () => {
  it("scans the app, scripts and project packages", () => {
    const files = scannedFiles();

    expect(files).toContain("src/instrumentation.ts");
    expect(files).toContain("scripts/lib/architecture/env-example.ts");
    expect(files).toContain("packages/env/src/index.ts");
    expect(files.some((file) => file.startsWith("packages/gato-cli/"))).toBe(
      false,
    );
  });

  it("no file under src, scripts, e2e or packages/*/src imports @/shared/lib/env", () => {
    const offenders = scannedFiles().filter((file) =>
      referencesLegacyEnv(fs.readFileSync(path.join(repoRoot, file), "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("src/shared/lib/env.ts does not exist", () => {
    expect(fs.existsSync(path.join(repoRoot, "src/shared/lib/env.ts"))).toBe(
      false,
    );
  });

  it("src/env.ts re-exports env from the generated registry and the CoreEnv type from @gatojs/env", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src/env.ts"), "utf8");

    expect(source).toContain('export { env } from "@/modules.generated";');
    expect(source).toContain('export type { CoreEnv } from "@gatojs/env";');
  });

  it("the generated server registry binds env with createEnv", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "src/modules.generated.ts"),
      "utf8",
    );

    expect(source).toContain('import { createEnv } from "@gatojs/env";\n');
    expect(source).toContain(
      "export const env = createEnv(moduleEnvSchemas);\n",
    );
  });
});
