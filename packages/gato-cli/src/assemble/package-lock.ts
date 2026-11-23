import { globToRegExp } from "../kit/files.js";
import type { ProjectNames } from "./project-names.js";

type LockEntry = { resolved?: unknown; link?: unknown } & Record<
  string,
  unknown
>;

type PackageLock = {
  name?: unknown;
  version?: unknown;
  packages?: Record<string, LockEntry>;
} & Record<string, unknown>;

const PROJECT_VERSION = "0.1.0";
const ROOT = "";

function isKitOnlyPath(path: string, kitOnly: RegExp[]): boolean {
  return kitOnly.some((pattern) => pattern.test(`${path}/package.json`));
}

function isLinkTo(entry: LockEntry, removed: Set<string>): boolean {
  return (
    entry.link === true &&
    typeof entry.resolved === "string" &&
    removed.has(entry.resolved)
  );
}

function withoutKitOnly(
  packages: Record<string, LockEntry>,
  kitOnly: RegExp[],
): Record<string, LockEntry> {
  const removed = new Set(
    Object.keys(packages).filter(
      (path) => path !== ROOT && isKitOnlyPath(path, kitOnly),
    ),
  );
  return Object.fromEntries(
    Object.entries(packages).filter(
      ([path, entry]) => !removed.has(path) && !isLinkTo(entry, removed),
    ),
  );
}

export function projectPackageLock(
  kitLock: string,
  input: { kitOnly: string[]; names: ProjectNames },
): string {
  const lock = JSON.parse(kitLock) as PackageLock;
  lock.name = input.names.slug;
  if (lock.version !== undefined) {
    lock.version = PROJECT_VERSION;
  }
  if (lock.packages !== undefined) {
    const packages = withoutKitOnly(
      lock.packages,
      input.kitOnly.map(globToRegExp),
    );
    const root = packages[ROOT];
    if (root !== undefined) {
      packages[ROOT] = {
        ...root,
        name: input.names.slug,
        version: PROJECT_VERSION,
      };
    }
    lock.packages = packages;
  }
  return `${JSON.stringify(lock, null, 2)}\n`;
}
