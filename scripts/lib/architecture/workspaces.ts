import fs from "node:fs";
import path from "node:path";

export const TOOL_PACKAGES = ["create-gato-app", "gato-cli"];

export const PACKAGES_TEST_INCLUDE = "packages/*/src/**/*.test.ts";

const PACKAGES_DIRECTORY = "packages";
const DOCKERFILE = "Dockerfile";
const LINT_STAGED_FILE = ".lintstagedrc.json";
const WORKSPACES_START = "wa:workspaces:start";
const WORKSPACES_END = "wa:workspaces:end";
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist"]);
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const PACKAGES_PROJECT_FILE =
  /^packages\/[^/]+\/src\/(?:[^/]+\/)*[^/]+\.test\.ts$/;
const WORKSPACE_COPY =
  /^COPY packages\/([^/\s]+)\/package\.json \.\/packages\/([^/\s]+)\/package\.json$/;
const ESLINT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
];

function compareCodePoint(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

function toPosix(relative: string): string {
  return relative.split(path.sep).join("/");
}

export function workspaceDirs(root: string): string[] {
  const packagesDir = path.join(root, PACKAGES_DIRECTORY);
  if (!fs.existsSync(packagesDir)) {
    return [];
  }
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        isFile(path.join(packagesDir, entry.name, "package.json")),
    )
    .map((entry) => entry.name)
    .sort(compareCodePoint);
}

function readPackageJson(root: string, dir: string): Record<string, unknown> {
  const file = path.join(root, PACKAGES_DIRECTORY, dir, "package.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

function listFilesUnder(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...listFilesUnder(full));
      }
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export function dockerfileWorkspacesRegion(dockerfile: string): string | null {
  const lines = dockerfile.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(WORKSPACES_START));
  const end = lines.findIndex((line) => line.includes(WORKSPACES_END));
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return lines.slice(start + 1, end).join("\n");
}

export function findDockerfileWorkspaceGaps(
  region: string,
  dirs: string[],
): string[] {
  const listed: string[] = [];
  const unexpected: string[] = [];
  for (const rawLine of region.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }
    const match = WORKSPACE_COPY.exec(line);
    if (match !== null && match[1] === match[2]) {
      listed.push(match[1]);
    } else {
      unexpected.push(`unexpected line: ${line}`);
    }
  }
  return [
    ...dirs
      .filter((dir) => !listed.includes(dir))
      .map((dir) => `missing: ${dir}`),
    ...listed
      .filter((dir) => !dirs.includes(dir))
      .map((dir) => `extra: ${dir}`),
    ...unexpected,
  ];
}

export function checkDockerfileWorkspaces(root: string): string[] {
  const dockerfile = fs.readFileSync(path.join(root, DOCKERFILE), "utf8");
  const region = dockerfileWorkspacesRegion(dockerfile);
  if (region === null) {
    return [`${DOCKERFILE}: no wa:workspaces region`];
  }
  return findDockerfileWorkspaceGaps(region, workspaceDirs(root));
}

export function matchedByPackagesProject(file: string): boolean {
  return PACKAGES_PROJECT_FILE.test(file);
}

export type TestRunnerWorkspace = {
  dir: string;
  scripts: Record<string, string>;
  testFiles: string[];
};

export function findTestRunnerGaps(
  workspaces: TestRunnerWorkspace[],
): string[] {
  return workspaces.flatMap(({ dir, scripts, testFiles }) => {
    const hasTestScript = Object.hasOwn(scripts, "test");
    if (TOOL_PACKAGES.includes(dir)) {
      return hasTestScript
        ? []
        : [`packages/${dir}: tool package has no test script of its own`];
    }
    return [
      ...(hasTestScript
        ? [`packages/${dir}: project package declares its own test script`]
        : []),
      ...testFiles
        .filter((file) => !matchedByPackagesProject(file))
        .map((file) => `${file}: not in the root packages Vitest project`),
    ];
  });
}

export function checkTestRunners(root: string): string[] {
  return findTestRunnerGaps(
    workspaceDirs(root).map((dir) => {
      const packageJson = readPackageJson(root, dir);
      const packageDir = path.join(root, PACKAGES_DIRECTORY, dir);
      return {
        dir,
        scripts: (packageJson.scripts ?? {}) as Record<string, string>,
        testFiles: listFilesUnder(packageDir)
          .map((file) => toPosix(path.relative(root, file)))
          .filter((file) => TEST_FILE.test(file))
          .sort(compareCodePoint),
      };
    }),
  );
}

export type LintStagedConfig = Record<string, string | string[]>;

export type LintStagedWorkspace = {
  dir: string;
  name: string;
  hasSourceFiles: boolean;
  ownEslintConfig: boolean;
  ignoredByRootEslint: boolean;
};

function commandsOf(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function runsEslintInWorkspace(command: string, name: string): boolean {
  const tokens = command.trim().split(/\s+/);
  const separator = tokens.indexOf("--");
  return (
    tokens.includes(`--workspace=${name}`) &&
    separator !== -1 &&
    tokens[separator + 1] === "eslint"
  );
}

function runsEslint(command: string): boolean {
  return command.trim().split(/\s+/)[0] === "eslint";
}

function hasWorkspaceEslintEntry(
  config: LintStagedConfig,
  workspace: LintStagedWorkspace,
): boolean {
  return Object.entries(config).some(
    ([pattern, value]) =>
      pattern.startsWith(`packages/${workspace.dir}/`) &&
      commandsOf(value).some((command) =>
        runsEslintInWorkspace(command, workspace.name),
      ),
  );
}

function hasRootEslintEntry(config: LintStagedConfig): boolean {
  return Object.entries(config).some(
    ([pattern, value]) =>
      !pattern.includes("/") && commandsOf(value).some(runsEslint),
  );
}

export function findLintStagedGaps(
  config: LintStagedConfig,
  workspaces: LintStagedWorkspace[],
): string[] {
  return workspaces.flatMap((workspace) => {
    const where = `packages/${workspace.dir}`;
    if (!workspace.hasSourceFiles) {
      return [];
    }
    if (workspace.ownEslintConfig) {
      return hasWorkspaceEslintEntry(config, workspace)
        ? []
        : [
            `${where}: no lint-staged entry runs ESLint in workspace ${workspace.name}`,
          ];
    }
    if (workspace.ignoredByRootEslint) {
      return [
        `${where}: ignored by the root ESLint config and has no eslint.config of its own`,
      ];
    }
    return hasRootEslintEntry(config)
      ? []
      : [`${where}: no root lint-staged ESLint entry`];
  });
}

export async function checkLintStaged(
  root: string,
  isIgnoredByRootEslint: (file: string) => Promise<boolean>,
): Promise<string[]> {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, LINT_STAGED_FILE), "utf8"),
  ) as LintStagedConfig;
  const workspaces: LintStagedWorkspace[] = [];
  for (const dir of workspaceDirs(root)) {
    const packageDir = path.join(root, PACKAGES_DIRECTORY, dir);
    const sources = listFilesUnder(packageDir)
      .filter((file) => SOURCE_FILE.test(file))
      .sort(compareCodePoint);
    const [firstSource] = sources;
    workspaces.push({
      dir,
      name: String(readPackageJson(root, dir).name),
      hasSourceFiles: firstSource !== undefined,
      ownEslintConfig: ESLINT_CONFIG_FILES.some((file) =>
        isFile(path.join(packageDir, file)),
      ),
      ignoredByRootEslint:
        firstSource !== undefined && (await isIgnoredByRootEslint(firstSource)),
    });
  }
  return findLintStagedGaps(config, workspaces);
}
