import { contentHash } from "../assemble/hash.js";
import { compareCodePoint } from "../compare.js";
import type { KitState } from "../manifest/schema.js";

export type EjectedFile = { path: string; reason: string; unchanged: boolean };

export type GatoFilesReport = {
  modified: string[];
  deleted: string[];
  ejected: EjectedFile[];
  staleEjected: string[];
};

const UNHASHED = new Set(["managed", "seed"]);

export function recordedHashes(state: KitState): Map<string, string> {
  return new Map(
    Object.values(state.modules).flatMap((entry) =>
      Object.entries(entry.files),
    ),
  );
}

export function gatoFileHashes(state: KitState): Map<string, string> {
  return new Map(
    [...recordedHashes(state)].filter(([, hash]) => !UNHASHED.has(hash)),
  );
}

export async function checkGatoFiles(input: {
  state: KitState;
  readProject: (path: string) => Promise<Buffer | null>;
}): Promise<GatoFilesReport> {
  const { state } = input;
  const hashes = gatoFileHashes(state);
  const report: GatoFilesReport = {
    modified: [],
    deleted: [],
    ejected: [],
    staleEjected: [],
  };
  for (const [path, hash] of [...hashes].sort(([a], [b]) =>
    compareCodePoint(a, b),
  )) {
    const content = await input.readProject(path);
    const unchanged = content !== null && contentHash(path, content) === hash;
    const ejected = state.ejected[path];
    if (ejected !== undefined) {
      report.ejected.push({ path, reason: ejected.reason, unchanged });
    } else if (content === null) {
      report.deleted.push(path);
    } else if (!unchanged) {
      report.modified.push(path);
    }
  }
  report.staleEjected = Object.keys(state.ejected)
    .filter((path) => !hashes.has(path))
    .sort(compareCodePoint);
  return report;
}
