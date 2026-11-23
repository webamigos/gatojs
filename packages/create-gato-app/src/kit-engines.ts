import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  enginesRange,
  parseEnginesRange,
  SUPPORTED_NODE_RANGES,
  type NodeRange,
} from "./node-version.js";

export type KitNodeRanges = {
  ranges: readonly NodeRange[];
  warning: string | null;
};

function enginesNodeOf(packageJson: unknown): unknown {
  if (typeof packageJson !== "object" || packageJson === null) {
    return undefined;
  }
  const engines = (packageJson as { engines?: unknown }).engines;
  if (typeof engines !== "object" || engines === null) {
    return undefined;
  }
  return (engines as { node?: unknown }).node;
}

export function nodeRangesFromPackageJson(packageJson: unknown): KitNodeRanges {
  const node = enginesNodeOf(packageJson);
  if (typeof node !== "string") {
    return { ranges: SUPPORTED_NODE_RANGES, warning: null };
  }
  const ranges = parseEnginesRange(node);
  if (ranges === null) {
    return {
      ranges: SUPPORTED_NODE_RANGES,
      warning: `The kit's Node range "${node}" is not one create-gato-app understands; checking against ${enginesRange(SUPPORTED_NODE_RANGES)} instead.`,
    };
  }
  return { ranges, warning: null };
}

export async function readKitPackageJson(kitDir: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(join(kitDir, "package.json"), "utf8");
  } catch (error) {
    throw new Error(`${kitDir} is not a GatoJS checkout (no package.json)`, {
      cause: error,
    });
  }
  return JSON.parse(text) as unknown;
}
