import type { KitConfig } from "../../kit/kit-config.js";
import type { ModuleManifest } from "../../manifest/schema.js";

export function manifestOf(
  name: string,
  overrides: Partial<ModuleManifest> = {},
): ModuleManifest {
  return {
    name,
    version: "1.0.0",
    description: name,
    requires: [],
    files: [],
    dependencies: {},
    devDependencies: {},
    env: [],
    schemaRelations: [],
    compose: null,
    ciSteps: null,
    workspaces: [],
    ...overrides,
  };
}

export const testConfig: KitConfig = {
  version: "0.1.0",
  repo: "https://github.com/webamigos/wa-kit.git",
  kitOnly: ["kit/**"],
  placeholders: {
    projectName: "WA App",
    projectSlug: "wa-app",
    projectSnake: "wa_app",
  },
  placeholderFiles: [
    "src/shared/config/project.ts",
    "package.json",
    "docker-compose.yml",
    ".env.example",
    "e2e/env.ts",
    ".github/workflows/e2e.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/mutation.yml",
    "src/test/integration/database-url.ts",
    "README.md",
  ],
  generatedFiles: ["src/modules.generated.ts"],
  managedFiles: ["package.json", "package-lock.json"],
};
