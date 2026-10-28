import { createHash } from "node:crypto";
import type { KitConfig } from "../kit/kit-config.js";
import { REGION_FILES } from "../generate/targets.js";

const REGION_START = /wa:([^:\s]+):start/;

export function stripRegions(content: string): string {
  const lines = content.split("\n");
  const kept: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] as string;
    kept.push(line);
    index += 1;
    const region = REGION_START.exec(line)?.[1];
    if (region === undefined) continue;
    const end = lines.findIndex(
      (candidate, position) =>
        position >= index && candidate.includes(`wa:${region}:end`),
    );
    if (end === -1) continue;
    kept.push(lines[end] as string);
    index = end + 1;
  }
  return kept.join("\n");
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function fileHash(
  file: string,
  content: Buffer,
  config: KitConfig,
): string {
  if (config.managedFiles.includes(file)) return "managed";
  if (REGION_FILES.includes(file)) {
    return sha256(stripRegions(content.toString("utf8")));
  }
  return sha256(content);
}
