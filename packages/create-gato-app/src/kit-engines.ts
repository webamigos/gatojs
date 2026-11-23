import type { NodeRange } from "./node-version.js";

export type KitNodeRanges = { ranges: readonly NodeRange[]; warning: string | null };

export function nodeRangesFromPackageJson(packageJson: unknown): KitNodeRanges {
  throw new Error(`not implemented: ${String(packageJson)}`);
}

export async function readKitPackageJson(kitDir: string): Promise<unknown> {
  throw new Error(`not implemented: ${kitDir}`);
}
