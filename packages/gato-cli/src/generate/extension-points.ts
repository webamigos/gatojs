import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { compareCodePoint } from "../compare.js";
import { GENERATED_HEADER } from "./registry.js";

export type Stability = "stable" | "experimental";
export type CatalogKind =
  | "modules"
  | "navItems"
  | "slots"
  | "components"
  | "events"
  | "commands"
  | "authPaths"
  | "permissions";
export type CatalogRow = {
  key: string;
  module: string;
  stability: Stability;
  description: string;
};
export type ExtensionPointCatalog = Record<CatalogKind, CatalogRow[]>;

export const CATALOG_KINDS: readonly CatalogKind[] = [
  "modules",
  "navItems",
  "slots",
  "components",
  "events",
  "commands",
  "authPaths",
  "permissions",
];
export const APP_EXTENSION_POINTS_FILE =
  "src/shared/lib/modules/extension-points.json";
export const EXTENSION_POINTS_TS = "src/extension-points.generated.ts";
export const EXTENSION_POINTS_MD = "EXTENSION_POINTS.md";

const APP_OWNER = "app";
const MAX_DESCRIPTION_LENGTH = 160;

const FILE_KEY_TO_KIND = {
  nav: "navItems",
  slots: "slots",
  components: "components",
  events: "events",
  commands: "commands",
  authPaths: "authPaths",
  permissions: "permissions",
} as const satisfies Record<string, Exclude<CatalogKind, "modules">>;

const stabilitySchema = z.enum(["stable", "experimental"], {
  error: 'expected "stable" or "experimental"',
});

const descriptionSchema = z
  .string()
  .min(1, "must not be empty")
  .max(
    MAX_DESCRIPTION_LENGTH,
    `must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
  )
  .refine((text) => !/[\r\n]/.test(text), "must be a single line")
  .refine((text) => !text.includes("|"), 'must not contain "|"');

const pointSchema = z.strictObject({
  stability: stabilitySchema,
  description: descriptionSchema,
});

const pointsSchema = z.record(z.string().min(1), pointSchema).optional();

const pointFields = {
  nav: pointsSchema,
  slots: pointsSchema,
  components: pointsSchema,
  events: pointsSchema,
  commands: pointsSchema,
  authPaths: pointsSchema,
  permissions: pointsSchema,
};

const featureFileSchema = z.strictObject({
  stability: stabilitySchema.optional(),
  description: descriptionSchema.optional(),
  ...pointFields,
});

const appFileSchema = z.strictObject(pointFields);

type ParsedFile = Partial<ExtensionPointCatalog> & {
  moduleRow?: Omit<CatalogRow, "key" | "module">;
};

function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export function parseExtensionPointsFile(
  file: string,
  text: string,
  owner: string,
): ParsedFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: invalid JSON (${(error as Error).message})`);
  }
  const schema = owner === APP_OWNER ? appFileSchema : featureFileSchema;
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `${file}: ${result.error.issues.map(describeIssue).join("; ")}`,
    );
  }
  const data: z.infer<typeof featureFileSchema> = result.data;
  const parsed: ParsedFile = {};
  for (const [fileKey, kind] of Object.entries(FILE_KEY_TO_KIND)) {
    const points = data[fileKey as keyof typeof FILE_KEY_TO_KIND] ?? {};
    parsed[kind] = Object.entries(points).map(([key, point]) => ({
      key,
      module: owner,
      stability: point.stability,
      description: point.description,
    }));
  }
  if (data.stability && data.description) {
    parsed.moduleRow = {
      stability: data.stability,
      description: data.description,
    };
  }
  return parsed;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function emptyCatalog(): ExtensionPointCatalog {
  return {
    modules: [],
    navItems: [],
    slots: [],
    components: [],
    events: [],
    commands: [],
    authPaths: [],
    permissions: [],
  };
}

function compareRows(a: CatalogRow, b: CatalogRow): number {
  return compareCodePoint(a.key, b.key) || compareCodePoint(a.module, b.module);
}

export async function readExtensionPoints(
  projectDir: string,
  features: { name: string; hasModuleTs: boolean }[],
): Promise<ExtensionPointCatalog> {
  const catalog = emptyCatalog();
  const addPoints = (parsed: ParsedFile) => {
    for (const kind of CATALOG_KINDS) {
      catalog[kind].push(...(parsed[kind] ?? []));
    }
  };
  for (const feature of features) {
    const file = `src/features/${feature.name}/extension-points.json`;
    const text = await readIfExists(join(projectDir, file));
    const parsed =
      text === null ? {} : parseExtensionPointsFile(file, text, feature.name);
    addPoints({ ...parsed, modules: [] });
    if (feature.hasModuleTs) {
      catalog.modules.push({
        key: feature.name,
        module: feature.name,
        stability: parsed.moduleRow?.stability ?? "experimental",
        description: parsed.moduleRow?.description ?? "-",
      });
    }
  }
  const appText = await readIfExists(
    join(projectDir, APP_EXTENSION_POINTS_FILE),
  );
  if (appText !== null) {
    addPoints({
      ...parseExtensionPointsFile(
        APP_EXTENSION_POINTS_FILE,
        appText,
        APP_OWNER,
      ),
      modules: [],
    });
  }
  for (const kind of CATALOG_KINDS) {
    catalog[kind].sort(compareRows);
  }
  return catalog;
}

const UNION_TYPES: readonly [string, CatalogKind][] = [
  ["ModuleKey", "modules"],
  ["NavItemId", "navItems"],
  ["SlotId", "slots"],
  ["ComponentHandle", "components"],
  ["EventName", "events"],
  ["CommandKey", "commands"],
  ["PermissionKey", "permissions"],
];

function renderTsRow(row: CatalogRow): string {
  const fields = [
    `key: ${JSON.stringify(row.key)}`,
    `module: ${JSON.stringify(row.module)}`,
    `stability: ${JSON.stringify(row.stability)}`,
    `description: ${JSON.stringify(row.description)}`,
  ];
  return `    { ${fields.join(", ")} },`;
}

function renderTsList(kind: CatalogKind, rows: CatalogRow[]): string[] {
  if (rows.length === 0) {
    return [`  ${kind}: [],`];
  }
  return [`  ${kind}: [`, ...rows.map(renderTsRow), "  ],"];
}

function renderUnion(rows: CatalogRow[]): string {
  if (rows.length === 0) {
    return "never";
  }
  return rows.map((row) => JSON.stringify(row.key)).join(" | ");
}

export function renderExtensionPointsTs(
  catalog: ExtensionPointCatalog,
): string {
  return [
    GENERATED_HEADER,
    'export type ExtensionPointStability = "stable" | "experimental";',
    "",
    "export interface ExtensionPoint {",
    "  key: string;",
    "  module: string;",
    "  stability: ExtensionPointStability;",
    "  description: string;",
    "}",
    "",
    "export const extensionPoints = {",
    ...CATALOG_KINDS.flatMap((kind) => renderTsList(kind, catalog[kind])),
    "} as const satisfies Record<string, readonly ExtensionPoint[]>;",
    "",
    ...UNION_TYPES.map(
      ([name, kind]) => `export type ${name} = ${renderUnion(catalog[kind])};`,
    ),
    "",
  ].join("\n");
}

const MARKDOWN_SECTIONS: readonly [CatalogKind, string, string][] = [
  [
    "modules",
    "Modules",
    "Configure under `modules.<key>` in `src/gato.config.ts`.",
  ],
  [
    "navItems",
    "Nav items",
    "Reorder or hide under `modules.<module>.nav` in `src/gato.config.ts`.",
  ],
  [
    "slots",
    "Slots",
    "Contribute from `slots.ts` or `client-slots.ts`; reorder or remove contributions under `modules.<module>.slots`.",
  ],
  [
    "components",
    "Component handles",
    "Replace or wrap from `components.ts` or under `modules.<module>.components`.",
  ],
  [
    "events",
    "Events",
    "Subscribe from `subscribers.ts`; subscribers run after the operation succeeded.",
  ],
  ["commands", "Commands", "Add `before` hooks from `command-hooks.ts`."],
  [
    "authPaths",
    "Better-auth paths",
    "Not GatoJS commands: hook them with a `before` or `after` hook in your module's `auth.ts` plugin.",
  ],
  [
    "permissions",
    "Permissions",
    "Check with `can(context, key)`; change default roles under `modules.<module>.permissions`.",
  ],
];

const MARKDOWN_INTRO =
  "Change GatoJS behaviour through these keys, not by editing Gato files (skill: `.claude/skills/gato-extend/SKILL.md`). A `stable` key changes only with a `kitFormat` bump and a release note naming the old and new key; an `experimental` key can change in any release. Labels and descriptions live in each module's `extension-points.json`.";

function renderMarkdownTable(rows: CatalogRow[]): string[] {
  if (rows.length === 0) {
    return ["_None._"];
  }
  return [
    "| Key | Module | Label | Description |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| \`${row.key}\` | ${row.module} | ${row.stability} | ${row.description} |`,
    ),
  ];
}

export function renderExtensionPointsMarkdown(
  catalog: ExtensionPointCatalog,
): string {
  return [
    "<!-- generated by GatoJS — do not edit. Run: npm run wa -- generate -->",
    "# Extension points",
    "",
    MARKDOWN_INTRO,
    "",
    ...MARKDOWN_SECTIONS.flatMap(([kind, heading, sentence]) => [
      `## ${heading}`,
      "",
      sentence,
      "",
      ...renderMarkdownTable(catalog[kind]),
      "",
    ]),
  ].join("\n");
}
