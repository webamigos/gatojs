import fs from "node:fs";
import path from "node:path";
import { listFiles, readRepoFile } from "./repo-files";

const CHECKED_STAGES = ["builder", "runner"] as const;
const REQUIRED_STAGE_ENV = [
  "NEXT_TELEMETRY_DISABLED=1",
  "CHECKPOINT_DISABLE=1",
] as const;

const ANALYTICS_PACKAGES = [
  "@vercel/analytics",
  "@vercel/speed-insights",
  "posthog-js",
  "posthog-node",
  "mixpanel-browser",
  "@segment/analytics-next",
  "@amplitude/analytics-browser",
  "react-ga4",
  "@hotjar/browser",
] as const;

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

const PACKAGE_MANIFESTS = ["package.json", "kit/modules/core.json"] as const;

const ANALYTICS_ID =
  /\b(?:G-[A-Z0-9]{9,}|GTM-[A-Z0-9]{6,}|UA-\d{4,}-\d+|AW-\d{9,}|phc_[A-Za-z0-9]{20,})\b/g;

const STAGE_START = /^\s*FROM\s+(?:--\S+\s+)*\S+\s+AS\s+(\S+)\s*$/i;
const ANY_FROM = /^\s*FROM\s/i;
const ENV_LINE = /^\s*ENV\s+(.*)$/i;
const ENV_PAIR = /([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(\S*))/g;

const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
const TEST_DIRECTORY = "__tests__";

function envPairs(assignments: string): string[] {
  return [...assignments.matchAll(ENV_PAIR)].map(
    ([, name, doubleQuoted, singleQuoted, bare]) =>
      `${name}=${doubleQuoted ?? singleQuoted ?? bare ?? ""}`,
  );
}

export function dockerfileStageEnv(
  dockerfile: string,
  stage: string,
): string[] {
  const env: string[] = [];
  let inStage = false;
  for (const line of dockerfile.split(/\r?\n/)) {
    if (ANY_FROM.test(line)) {
      inStage = STAGE_START.exec(line)?.[1] === stage;
      continue;
    }
    const envLine = inStage ? ENV_LINE.exec(line) : null;
    if (envLine !== null) {
      env.push(...envPairs(envLine[1]));
    }
  }
  return env;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findAnalyticsPackages(packageJson: unknown): string[] {
  if (!isRecord(packageJson)) {
    return [];
  }
  const sections = DEPENDENCY_SECTIONS.map(
    (section) => packageJson[section],
  ).filter(isRecord);
  return ANALYTICS_PACKAGES.filter((name) =>
    sections.some((section) => Object.keys(section).includes(name)),
  );
}

export function findHardcodedAnalyticsIds(source: string): string[] {
  return [...source.matchAll(ANALYTICS_ID)].map(([id]) => id);
}

function checkDockerfile(root: string): string[] {
  const file = path.join(root, "Dockerfile");
  const dockerfile = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  return CHECKED_STAGES.flatMap((stage) => {
    const env = dockerfileStageEnv(dockerfile, stage);
    return REQUIRED_STAGE_ENV.filter((pair) => !env.includes(pair)).map(
      (pair) => `Dockerfile ${stage}: ${pair} missing`,
    );
  });
}

function checkPackageManifests(root: string): string[] {
  return PACKAGE_MANIFESTS.filter((file) =>
    fs.existsSync(path.join(root, file)),
  ).flatMap((file) =>
    findAnalyticsPackages(JSON.parse(readRepoFile(root, file))).map(
      (name) => `${file}: ${name}`,
    ),
  );
}

function isScannedSource(file: string): boolean {
  return (
    SOURCE_FILE.test(file) &&
    !TEST_FILE.test(file) &&
    !file.split("/").includes(TEST_DIRECTORY)
  );
}

function checkSourceIds(root: string): string[] {
  return listFiles(root, "src", isScannedSource).flatMap((file) =>
    findHardcodedAnalyticsIds(readRepoFile(root, file)).map(
      (id) => `${file}: ${id}`,
    ),
  );
}

export function checkTelemetry(root: string): string[] {
  return [
    ...checkDockerfile(root),
    ...checkPackageManifests(root),
    ...checkSourceIds(root),
  ];
}
