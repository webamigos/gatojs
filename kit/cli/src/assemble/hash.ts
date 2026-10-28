import { createHash } from "node:crypto";
import type { KitConfig } from "../kit/kit-config.js";

const REGION_START = /wa:([^:\s]+):start/;

export function stripRegions(content: string): string {
  const kept: string[] = [];
  let openRegion: string | null = null;
  for (const line of content.split("\n")) {
    if (openRegion === null) {
      kept.push(line);
      openRegion = REGION_START.exec(line)?.[1] ?? null;
    } else if (line.includes(`wa:${openRegion}:end`)) {
      kept.push(line);
      openRegion = null;
    }
  }
  return kept.join("\n");
}

export function fileHash(
  file: string,
  content: string,
  config: KitConfig,
): string {
  if (config.managedFiles.includes(file)) return "managed";
  return createHash("sha256").update(stripRegions(content)).digest("hex");
}
