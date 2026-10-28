import { readFile } from "node:fs/promises";
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

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `${INDENT}${line}`))
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

async function envBody({ modules, project }: RegionContext): Promise<string> {
  return modules
    .filter((m) => m.name !== "core" && m.env.length > 0)
    .map((m) =>
      [
        `# ${m.name}`,
        ...m.env.map(
          (v) => `${v.name}=${fillPlaceholders(v.example, project)}`,
        ),
      ].join("\n"),
    )
    .join("\n\n");
}

async function composeBody({
  modules,
  projectDir,
}: RegionContext): Promise<string> {
  const parts: string[] = [];
  for (const m of modules) {
    if (m.compose === null) continue;
    const content = await readFile(join(projectDir, m.compose), "utf8");
    parts.push(indent(content.replace(/\n+$/, "")));
  }
  return parts.join("\n");
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
];

export const REGION_FILES: string[] = regionTargets
  .map((target) => target.file)
  .sort(compareCodePoint);

export async function renderRegionTarget(
  target: RegionTarget,
  context: RegionContext,
): Promise<{ file: string; current: string; next: string } | null> {
  let current: string;
  try {
    current = await readFile(join(context.projectDir, target.file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const body = await target.body(context);
  return {
    file: target.file,
    current,
    next: replaceRegion(current, target.file, target.marker, body),
  };
}
