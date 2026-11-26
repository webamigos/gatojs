import { globToRegExp } from "../lib/architecture/glob";

export type RepoFile = { path: string; text: string };

export type DependencySection = "dependencies" | "devDependencies";

export type SyncInput = {
  rootPackageJson: string;
  manifests: RepoFile[];
  workspacePackages: RepoFile[];
  readBase: (path: string) => string | null;
};

export type DependencyUpdate = {
  module: string;
  path: string;
  section: DependencySection;
  name: string;
  from: string;
  to: string;
};

export type VersionBump = {
  module: string;
  path: string;
  from: string;
  to: string;
};

export type SyncResult = {
  files: RepoFile[];
  updates: DependencyUpdate[];
  bumps: VersionBump[];
  warnings: string[];
};

export type SyncArgs = { base: string; check: boolean };

type Pins = Record<string, string>;

type Manifest = {
  name: string;
  version: string;
  files: string[];
} & Partial<Record<DependencySection, Pins>>;

type PackageJson = Partial<Record<string, Pins>>;

const MANIFEST_SECTIONS: DependencySection[] = [
  "dependencies",
  "devDependencies",
];

const WORKSPACE_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const DEFAULT_BASE = "origin/main";
export const ALREADY_IN_SYNC = "Manifests already follow package.json.";

export function bumpPatch(version: string): string {
  const match = RELEASE_VERSION.exec(version);
  if (match === null) {
    throw new Error(
      `Module version ${JSON.stringify(version)} is not a release version (major.minor.patch)`,
    );
  }
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function escapeRegExp(text: string): string {
  return text.replace(REGEXP_SPECIAL, "\\$&");
}

function owns(manifest: Manifest, path: string): boolean {
  return manifest.files.some((glob) => globToRegExp(glob).test(path));
}

function stringEnd(text: string, start: number): number {
  let index = start + 1;
  while (text[index] !== '"') {
    index += text[index] === "\\" ? 2 : 1;
  }
  return index;
}

function topLevelKeyEnd(text: string, key: string): number {
  let depth = 0;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      const end = stringEnd(text, index);
      const isKey = /^\s*:/.test(text.slice(end + 1));
      if (
        depth === 1 &&
        isKey &&
        JSON.parse(text.slice(index, end + 1)) === key
      ) {
        return end + 1;
      }
      index = end + 1;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
    }
    index += 1;
  }
  throw new Error(`No top-level key ${JSON.stringify(key)}`);
}

function closingBrace(text: string, open: number): number {
  let index = open + 1;
  while (text[index] !== "}") {
    index = text[index] === '"' ? stringEnd(text, index) + 1 : index + 1;
  }
  return index;
}

function replaceVersion(text: string, from: string, to: string): string {
  const keyEnd = topLevelKeyEnd(text, "version");
  const pattern = new RegExp(`^(\\s*:\\s*)"${escapeRegExp(from)}"`);
  const rest = text.slice(keyEnd);
  if (!pattern.test(rest)) {
    throw new Error(`Cannot find "version": "${from}" to bump`);
  }
  return text.slice(0, keyEnd) + rest.replace(pattern, `$1"${to}"`);
}

function replacePin(
  text: string,
  section: DependencySection,
  name: string,
  from: string,
  to: string,
): string {
  const open = text.indexOf("{", topLevelKeyEnd(text, section));
  const close = closingBrace(text, open);
  const pattern = new RegExp(
    `("${escapeRegExp(name)}"\\s*:\\s*)"${escapeRegExp(from)}"`,
  );
  const body = text.slice(open, close).replace(pattern, `$1"${to}"`);
  return text.slice(0, open) + body + text.slice(close);
}

function canonicalSections(
  parsed: object,
  sections: readonly string[],
): string {
  const sectioned = parsed as PackageJson;
  return JSON.stringify(
    sections.map((section) =>
      Object.entries(sectioned[section] ?? {}).sort(([a], [b]) =>
        a < b ? -1 : 1,
      ),
    ),
  );
}

function workspaceChanged(
  workspace: RepoFile,
  readBase: SyncInput["readBase"],
): boolean {
  const baseText = readBase(workspace.path);
  if (baseText === null) {
    return false;
  }
  return (
    canonicalSections(JSON.parse(workspace.text), WORKSPACE_SECTIONS) !==
    canonicalSections(JSON.parse(baseText), WORKSPACE_SECTIONS)
  );
}

function staleWorkspaceWarnings(
  updates: DependencyUpdate[],
  workspacePackages: RepoFile[],
): string[] {
  const warnings = new Set<string>();
  for (const workspace of workspacePackages) {
    const parsed = JSON.parse(workspace.text) as PackageJson;
    for (const update of updates) {
      const stale = WORKSPACE_SECTIONS.some(
        (section) => parsed[section]?.[update.name] === update.from,
      );
      if (stale) {
        warnings.add(
          `${workspace.path} pins ${update.name} ${update.from}; package.json has ${update.to}`,
        );
      }
    }
  }
  return [...warnings];
}

export function syncManifestDependencies(input: SyncInput): SyncResult {
  const root = JSON.parse(input.rootPackageJson) as PackageJson;
  const changedWorkspaces = input.workspacePackages
    .filter((workspace) => workspaceChanged(workspace, input.readBase))
    .map((workspace) => workspace.path);

  const files: RepoFile[] = [];
  const updates: DependencyUpdate[] = [];
  const bumps: VersionBump[] = [];

  for (const { path, text: original } of input.manifests) {
    const manifest = JSON.parse(original) as Manifest;
    let text = original;
    for (const section of MANIFEST_SECTIONS) {
      for (const [name, from] of Object.entries(manifest[section] ?? {})) {
        const to = root[section]?.[name];
        if (to === undefined || to === from) {
          continue;
        }
        text = replacePin(text, section, name, from, to);
        updates.push({ module: manifest.name, path, section, name, from, to });
      }
    }

    const baseText = input.readBase(path);
    if (baseText !== null) {
      const base = JSON.parse(baseText) as Manifest;
      const pinsChanged =
        canonicalSections(JSON.parse(text), MANIFEST_SECTIONS) !==
        canonicalSections(base, MANIFEST_SECTIONS);
      const ownedWorkspaceChanged = changedWorkspaces.some((workspace) =>
        owns(manifest, workspace),
      );
      if (
        manifest.version === base.version &&
        (pinsChanged || ownedWorkspaceChanged)
      ) {
        const to = bumpPatch(manifest.version);
        text = replaceVersion(text, manifest.version, to);
        bumps.push({ module: manifest.name, path, from: manifest.version, to });
      }
    }

    if (text !== original) {
      files.push({ path, text });
    }
  }

  return {
    files,
    updates,
    bumps,
    warnings: staleWorkspaceWarnings(updates, input.workspacePackages),
  };
}

export function parseSyncArgs(argv: string[]): SyncArgs {
  const args: SyncArgs = { base: DEFAULT_BASE, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--check") {
      args.check = true;
    } else if (arg.startsWith("--base=")) {
      args.base = arg.slice("--base=".length);
    } else if (arg === "--base") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--base needs a git ref, e.g. --base origin/main");
      }
      args.base = value;
      index += 1;
    } else {
      throw new Error(
        `Unknown argument ${JSON.stringify(arg)}. Usage: sync-manifest-deps [--check] [--base <ref>]`,
      );
    }
  }
  if (args.base === "") {
    throw new Error("--base needs a git ref, e.g. --base origin/main");
  }
  return args;
}

export function formatReport(result: SyncResult): string {
  if (
    result.updates.length === 0 &&
    result.bumps.length === 0 &&
    result.warnings.length === 0
  ) {
    return ALREADY_IN_SYNC;
  }
  const paths = [
    ...new Set([
      ...result.bumps.map((bump) => bump.path),
      ...result.updates.map((update) => update.path),
    ]),
  ];
  const lines = paths.flatMap((path) => {
    const bump = result.bumps.find((candidate) => candidate.path === path);
    const header = bump ? `${path} ${bump.from} -> ${bump.to}` : path;
    return [
      header,
      ...result.updates
        .filter((update) => update.path === path)
        .map((update) => `  ${update.name} ${update.from} -> ${update.to}`),
    ];
  });
  return [
    ...lines,
    ...result.warnings.map((warning) => `warning: ${warning}`),
  ].join("\n");
}
