import fs from "node:fs";
import path from "node:path";
import type { ModuleDef } from "../../../src/shared/lib/modules/define-module";
import { featureFiles, importModule } from "./gato-config-keys";
import { listFiles, readRepoFile } from "./repo-files";
import { compareCodePoint } from "./workspaces";

type Kind =
  | "modules"
  | "navItems"
  | "slots"
  | "components"
  | "events"
  | "commands"
  | "authPaths"
  | "permissions";

const KINDS: readonly Kind[] = [
  "modules",
  "navItems",
  "slots",
  "components",
  "events",
  "commands",
  "authPaths",
  "permissions",
];

const NAMESPACED_KINDS: ReadonlySet<Kind> = new Set([
  "navItems",
  "slots",
  "components",
  "events",
  "commands",
  "permissions",
]);

type CatalogRow = { key: string; module: string };
type Catalog = Partial<Record<Kind, readonly CatalogRow[]>>;
type Found = { key: string; file: string };
type Problem = { kind: Kind; key: string; message: string };

const CATALOG_FILE = "src/extension-points.generated.ts";
const CORE_SLOTS_FILE = "src/shared/lib/modules/slots.ts";
const CORE_EVENTS_FILE = "src/shared/lib/events/core-events.ts";
const ORGANIZATION_EVENTS_FILE = "src/shared/lib/auth/organization-events.ts";
const FEATURES_DIRECTORY = "src/features";
const APP_MODULE = "app";
const CORE_EVENT_MODULES: ReadonlySet<string> = new Set([
  "auth",
  "organizations",
  "users",
]);

const STRING_LITERAL = /^(["'])([^"'\\]*)\1$/;
const QUOTED = /["']([^"'\\]+)["']/g;

function isSourceFile(file: string): boolean {
  return (
    /\.tsx?$/.test(file) &&
    !file.split("/").includes("__tests__") &&
    !/\.(test|spec)\./.test(file) &&
    !file.endsWith(".generated.ts")
  );
}

function featureRepoPath(directory: string, fileName: string): string {
  return `${FEATURES_DIRECTORY}/${directory}/${fileName}`;
}

async function importIfExists<T>(
  root: string,
  file: string,
): Promise<T | null> {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? importModule<T>(absolute) : null;
}

function skipString(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length && text[index] !== quote) {
    index += text[index] === "\\" ? 2 : 1;
  }
  return index + 1;
}

function skipComment(text: string, start: number): number {
  if (text.startsWith("//", start)) {
    const end = text.indexOf("\n", start);
    return end === -1 ? text.length : end;
  }
  if (text.startsWith("/*", start)) {
    const end = text.indexOf("*/", start + 2);
    return end === -1 ? text.length : end + 2;
  }
  return start;
}

function scan(
  text: string,
  start: number,
  visit: (char: string, index: number, depth: number) => boolean,
): void {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    const afterComment = skipComment(text, index);
    if (afterComment !== index) {
      index = afterComment;
      continue;
    }
    const char = text[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipString(text, index);
      continue;
    }
    if ("([{".includes(char)) {
      depth++;
    } else if (")]}".includes(char)) {
      depth--;
    }
    if (visit(char, index, depth)) {
      return;
    }
    index++;
  }
}

function callArguments(text: string, openParen: number): string[] {
  const args: string[] = [];
  let argumentStart = openParen + 1;
  scan(text, openParen, (char, index, depth) => {
    if (char === "," && depth === 1) {
      args.push(text.slice(argumentStart, index).trim());
      argumentStart = index + 1;
    }
    if (char === ")" && depth === 0) {
      args.push(text.slice(argumentStart, index).trim());
      return true;
    }
    return false;
  });
  return args.filter((arg) => arg.length > 0);
}

function jsxTag(text: string, start: number): string {
  let end = text.length;
  scan(text, start, (char, index, depth) => {
    if (char === ">" && depth === 0) {
      end = index;
      return true;
    }
    return false;
  });
  return text.slice(start, end);
}

function stringLiteral(arg: string | undefined): string | null {
  return arg === undefined ? null : (STRING_LITERAL.exec(arg)?.[2] ?? null);
}

function callsOf(text: string, callee: string): string[][] {
  const pattern = new RegExp(`\\b${callee}\\(`, "g");
  return [...text.matchAll(pattern)].map((match) =>
    callArguments(text, match.index + match[0].length - 1),
  );
}

function quotedValues(text: string): string[] {
  return [...text.matchAll(QUOTED)].map((match) => match[1]);
}

type SourceScan = {
  renderedSlots: Found[];
  components: Found[];
  emittedEvents: Found[];
  commands: Found[];
};

function scanSource(file: string, text: string): SourceScan {
  const found = (keys: (string | null)[]): Found[] =>
    keys
      .filter((key): key is string => key !== null)
      .map((key) => ({ key, file }));

  const slotTags = [...text.matchAll(/<(?:Slot|ClientSlot)\b/g)].map((match) =>
    jsxTag(text, match.index),
  );
  const renderedSlots = found([
    ...slotTags.map((tag) => /\bid=["']([^"']+)["']/.exec(tag)?.[1] ?? null),
    ...callsOf(text, "visibleContributions").map((args) =>
      stringLiteral(args[1]),
    ),
  ]);

  const commandCalls = callsOf(text, "defineCommand");
  const commandEvents = commandCalls.length
    ? [...text.matchAll(/\bevents:\s*\[([^\]]*)\]/g)].flatMap((match) =>
        quotedValues(match[1]),
      )
    : [];
  const originNames = [
    ...text.matchAll(/\borigin:[^\n]*\n\s*name:\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);

  return {
    renderedSlots,
    components: found(
      callsOf(text, "overridable").map((args) => stringLiteral(args[0])),
    ),
    emittedEvents: found([
      ...callsOf(text, "emitEvent").flatMap((args) => args.map(stringLiteral)),
      ...commandEvents,
      ...originNames,
    ]),
    commands: found(
      commandCalls.map(
        (args) => /\bkey:\s*["']([^"']+)["']/.exec(args[0] ?? "")?.[1] ?? null,
      ),
    ),
  };
}

function scanSources(root: string): SourceScan {
  const result: SourceScan = {
    renderedSlots: [],
    components: [],
    emittedEvents: [],
    commands: [],
  };
  for (const file of listFiles(root, "src", isSourceFile)) {
    const scanned = scanSource(file, readRepoFile(root, file));
    result.renderedSlots.push(...scanned.renderedSlots);
    result.components.push(...scanned.components);
    result.emittedEvents.push(...scanned.emittedEvents);
    result.commands.push(...scanned.commands);
  }
  return result;
}

type ModuleDeclarations = {
  modules: Found[];
  navItems: Found[];
  permissions: Found[];
};

async function moduleDeclarations(root: string): Promise<ModuleDeclarations> {
  const declarations: ModuleDeclarations = {
    modules: [],
    navItems: [],
    permissions: [],
  };
  for (const { directory, file } of featureFiles(root, "module.ts")) {
    const repoPath = featureRepoPath(directory, "module.ts");
    const { default: moduleDef } = await importModule<{ default: ModuleDef }>(
      file,
    );
    declarations.modules.push({ key: directory, file: repoPath });
    for (const item of moduleDef.nav ?? []) {
      if (item.id) {
        declarations.navItems.push({ key: item.id, file: repoPath });
      }
    }
    for (const key of Object.keys(moduleDef.permissions ?? {})) {
      declarations.permissions.push({ key, file: repoPath });
    }
  }
  return declarations;
}

type SlotDefinitions = { id: string }[];

async function declaredSlots(root: string): Promise<Found[]> {
  const core = await importIfExists<{ coreSlotDefinitions?: SlotDefinitions }>(
    root,
    CORE_SLOTS_FILE,
  );
  const declared: Found[] = (core?.coreSlotDefinitions ?? []).map(({ id }) => ({
    key: id,
    file: CORE_SLOTS_FILE,
  }));
  for (const { directory, file } of featureFiles(root, "slots.ts")) {
    const { slotDefinitions = [] } = await importModule<{
      slotDefinitions?: SlotDefinitions;
    }>(file);
    declared.push(
      ...slotDefinitions.map(({ id }) => ({
        key: id,
        file: featureRepoPath(directory, "slots.ts"),
      })),
    );
  }
  return declared;
}

async function declaredEvents(root: string): Promise<Found[]> {
  const core = await importIfExists<{ coreEvents?: object }>(
    root,
    CORE_EVENTS_FILE,
  );
  const declared: Found[] = Object.keys(core?.coreEvents ?? {}).map((key) => ({
    key,
    file: CORE_EVENTS_FILE,
  }));
  for (const { directory, file } of featureFiles(root, "events.ts")) {
    const { events = {} } = await importModule<{ events?: object }>(file);
    declared.push(
      ...Object.keys(events).map((key) => ({
        key,
        file: featureRepoPath(directory, "events.ts"),
      })),
    );
  }
  return declared;
}

async function declaredAuthPaths(root: string): Promise<Found[]> {
  const imported = await importIfExists<{
    ORGANIZATION_EVENT_PATHS?: Iterable<string>;
  }>(root, ORGANIZATION_EVENTS_FILE);
  return [...(imported?.ORGANIZATION_EVENT_PATHS ?? [])].map((key) => ({
    key,
    file: ORGANIZATION_EVENTS_FILE,
  }));
}

function staleMessage(kind: Kind, { key, module }: CatalogRow): string {
  switch (kind) {
    case "modules":
      return `${key}: no module (expected in ${featureRepoPath(key, "module.ts")})`;
    case "navItems":
      return `${key}: no nav item (expected in ${featureRepoPath(module, "module.ts")})`;
    case "slots":
      return `${key}: no defineSlot (expected in ${module === APP_MODULE ? CORE_SLOTS_FILE : featureRepoPath(module, "slots.ts")})`;
    case "components":
      return `${key}: no overridable (expected in ${FEATURES_DIRECTORY}/${module}/)`;
    case "events":
      return `${key}: no event declaration (expected in ${CORE_EVENT_MODULES.has(module) ? CORE_EVENTS_FILE : featureRepoPath(module, "events.ts")})`;
    case "commands":
      return `${key}: no defineCommand (expected in ${featureRepoPath(module, "services/commands/")})`;
    case "authPaths":
      return `${key}: not in ORGANIZATION_EVENT_PATHS (expected in ${ORGANIZATION_EVENTS_FILE})`;
    case "permissions":
      return `${key}: no permission (expected in ${featureRepoPath(module, "module.ts")})`;
  }
}

function catalogProblems(
  kind: Kind,
  rows: readonly CatalogRow[],
  inCode: readonly Found[],
): Problem[] {
  const codeKeys = new Set(inCode.map(({ key }) => key));
  const catalogKeys = new Set(rows.map(({ key }) => key));
  const stale = rows
    .filter(({ key }) => !codeKeys.has(key))
    .map((row) => ({ kind, key: row.key, message: staleMessage(kind, row) }));
  const missing = inCode
    .filter(({ key }) => !catalogKeys.has(key))
    .map(({ key, file }) => ({
      kind,
      key,
      message: `${key}: missing from EXTENSION_POINTS.md (${file})`,
    }));
  const namespace = NAMESPACED_KINDS.has(kind)
    ? rows
        .filter(
          ({ key, module }) =>
            !key.startsWith(`${module}.`) || key.length <= module.length + 1,
        )
        .map(({ key, module }) => ({
          kind,
          key,
          message: `${key}: must start with "${module}."`,
        }))
    : [];
  return [...stale, ...missing, ...namespace];
}

function usageProblems(
  kind: Kind,
  declared: readonly Found[],
  used: readonly Found[],
  verb: string,
): Problem[] {
  const usedKeys = new Set(used.map(({ key }) => key));
  const declaredKeys = new Set(declared.map(({ key }) => key));
  return [
    ...declared
      .filter(({ key }) => !usedKeys.has(key))
      .map(({ key, file }) => ({
        kind,
        key,
        message: `${key}: declared in ${file} but never ${verb}`,
      })),
    ...used
      .filter(({ key }) => !declaredKeys.has(key))
      .map(({ key, file }) => ({
        kind,
        key,
        message: `${key}: ${verb} but not declared (${file})`,
      })),
  ];
}

function compareProblems(a: Problem, b: Problem): number {
  return (
    KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
    compareCodePoint(a.key, b.key) ||
    compareCodePoint(a.message, b.message)
  );
}

export async function findExtensionPointProblems(
  root: string,
): Promise<string[]> {
  const imported = await importIfExists<{ extensionPoints?: Catalog }>(
    root,
    CATALOG_FILE,
  );
  if (imported === null) {
    return [`${CATALOG_FILE}: missing; run npm run wa -- generate`];
  }
  const catalog = imported.extensionPoints ?? {};
  const modules = await moduleDeclarations(root);
  const sources = scanSources(root);
  const slots = await declaredSlots(root);
  const events = await declaredEvents(root);
  const inCode: Record<Kind, Found[]> = {
    modules: modules.modules,
    navItems: modules.navItems,
    slots,
    components: sources.components,
    events,
    commands: sources.commands,
    authPaths: await declaredAuthPaths(root),
    permissions: modules.permissions,
  };
  const problems: Problem[] = [
    ...KINDS.flatMap((kind) =>
      catalogProblems(kind, catalog[kind] ?? [], inCode[kind]),
    ),
    ...usageProblems("slots", slots, sources.renderedSlots, "rendered"),
    ...usageProblems("events", events, sources.emittedEvents, "emitted"),
  ];
  const messages = problems.sort(compareProblems).map(({ message }) => message);
  return [...new Set(messages)];
}
