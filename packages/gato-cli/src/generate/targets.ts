import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { compareCodePoint } from "../compare.js";
import type { ModuleManifest } from "../manifest/schema.js";
import { replaceRegion } from "./regions.js";

export type RegionContext = {
  modules: ModuleManifest[];
  projectDir: string;
  project: { name: string; slug: string };
};

export type RegionTarget = {
  file: string;
  marker: string;
  body: (context: RegionContext) => Promise<string>;
};

const INDENT = "  ";
const CI_STEPS_INDENT = "      ";

function indent(text: string, prefix: string = INDENT): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `${prefix}${line}`))
    .join("\n");
}

function relationsBody(model: string) {
  return async ({ modules }: RegionContext): Promise<string> =>
    modules
      .flatMap((m) => m.schemaRelations)
      .filter((relation) => relation.model === model)
      .map((relation) => `${INDENT}${relation.field}`)
      .join("\n");
}

function fillPlaceholders(
  text: string,
  project: { name: string; slug: string },
): string {
  return text
    .replaceAll("{{projectSlug}}", project.slug)
    .replaceAll("{{projectName}}", project.name);
}

type EnvVariable = ModuleManifest["env"][number];

function envBodyWith(pickValue: (variable: EnvVariable) => string) {
  return async ({ modules, project }: RegionContext): Promise<string> =>
    modules
      .filter((m) => m.name !== "core" && m.env.length > 0)
      .map((m) =>
        [
          `# ${m.name}`,
          ...m.env.map(
            (v) => `${v.name}=${fillPlaceholders(pickValue(v), project)}`,
          ),
        ].join("\n"),
      )
      .join("\n\n");
}

const envBody = envBodyWith((v) => v.example);

export const selfhostEnvBody = envBodyWith(
  (v) => v.selfhostExample ?? v.example,
);

function composeBodyWith(pickFile: (m: ModuleManifest) => string | null) {
  return async ({ modules, projectDir }: RegionContext): Promise<string> => {
    const parts: string[] = [];
    for (const m of modules) {
      const file = pickFile(m);
      if (file === null) {
        continue;
      }
      const content = await readFile(join(projectDir, file), "utf8");
      parts.push(indent(content.replace(/\n+$/, "")));
    }
    return parts.join("\n");
  };
}

const composeBody = composeBodyWith((m) => m.compose);

export const selfhostComposeBody = composeBodyWith((m) => m.selfhostCompose);

async function ciStepsBody({
  modules,
  projectDir,
}: RegionContext): Promise<string> {
  const parts: string[] = [];
  for (const m of modules) {
    if (m.ciSteps === null) {
      continue;
    }
    const content = await readFile(join(projectDir, m.ciSteps), "utf8");
    parts.push(indent(content.replace(/\n+$/, ""), CI_STEPS_INDENT));
  }
  return parts.join("\n\n");
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function packageDirectories(projectDir: string): Promise<string[]> {
  const packagesDir = join(projectDir, "packages");
  let entries;
  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      (await isFile(join(packagesDir, entry.name, "package.json")))
    ) {
      names.push(entry.name);
    }
  }
  return names.sort(compareCodePoint);
}

export async function workspacesBody({
  projectDir,
}: RegionContext): Promise<string> {
  return (await packageDirectories(projectDir))
    .map(
      (name) =>
        `COPY packages/${name}/package.json ./packages/${name}/package.json`,
    )
    .join("\n");
}

export const regionTargets: RegionTarget[] = [
  {
    file: "prisma/schema/auth.prisma",
    marker: "relations",
    body: relationsBody("User"),
  },
  {
    file: "prisma/schema/organizations.prisma",
    marker: "relations",
    body: relationsBody("Organization"),
  },
  { file: ".env.example", marker: "modules", body: envBody },
  { file: "docker-compose.yml", marker: "services", body: composeBody },
  {
    file: "docker-compose.selfhost.yml",
    marker: "services",
    body: selfhostComposeBody,
  },
  { file: ".env.selfhost.example", marker: "modules", body: selfhostEnvBody },
  {
    file: ".github/workflows/ci.yml",
    marker: "ci-integration",
    body: ciStepsBody,
  },
  {
    file: ".github/workflows/mutation.yml",
    marker: "ci-integration",
    body: ciStepsBody,
  },
  { file: "Dockerfile", marker: "workspaces", body: workspacesBody },
];

export const REGION_FILES: string[] = regionTargets
  .map((target) => target.file)
  .sort(compareCodePoint);

function hasAnyRegionMarker(content: string, marker: string): boolean {
  return (
    content.includes(`wa:${marker}:start`) ||
    content.includes(`wa:${marker}:end`)
  );
}

export async function renderRegionTarget(
  target: RegionTarget,
  context: RegionContext,
): Promise<{ file: string; current: string; next: string } | null> {
  let current: string;
  try {
    current = await readFile(join(context.projectDir, target.file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const body = await target.body(context);
  if (!hasAnyRegionMarker(current, target.marker)) {
    if (body === "") {
      return null;
    }
    throw new Error(
      `${target.file}: missing region wa:${target.marker}; add lines with the markers wa:${target.marker}:start and wa:${target.marker}:end`,
    );
  }
  return {
    file: target.file,
    current,
    next: replaceRegion(current, target.file, target.marker, body),
  };
}
