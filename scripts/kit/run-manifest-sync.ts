import type { SyncResult } from "./manifest-deps";

export type RunWa = (args: string[]) => Promise<void>;

export type RunManifestSyncOptions = {
  repoDir: string;
  base: string;
  check: boolean;
  runWa: RunWa;
};

export async function runManifestSync(
  options: RunManifestSyncOptions,
): Promise<{ changed: boolean; result: SyncResult }> {
  throw new Error(`not implemented: runManifestSync(${options.repoDir})`);
}
