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

export function bumpPatch(version: string): string {
  throw new Error(`not implemented: bumpPatch(${version})`);
}

export function syncManifestDependencies(input: SyncInput): SyncResult {
  throw new Error(
    `not implemented: syncManifestDependencies(${input.manifests.length})`,
  );
}

export function parseSyncArgs(argv: string[]): SyncArgs {
  throw new Error(`not implemented: parseSyncArgs(${argv.join(" ")})`);
}

export function formatReport(result: SyncResult): string {
  throw new Error(`not implemented: formatReport(${result.files.length})`);
}
