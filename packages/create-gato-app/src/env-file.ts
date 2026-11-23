import type { StorageAnswer } from "./questions.js";

export const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const SUFFIX_LENGTH = 6;

export function setEnvValues(text: string, values: Record<string, string>): string {
  throw new Error(`not implemented: ${text} ${Object.keys(values).join()}`);
}

export function readEnvValue(text: string, key: string): string | null {
  throw new Error(`not implemented: ${text} ${key}`);
}

export function randomSuffix(bytes: Uint8Array): string {
  throw new Error(`not implemented: ${bytes.length}`);
}

export function composeProjectName(slug: string, suffix: string): string {
  throw new Error(`not implemented: ${slug} ${suffix}`);
}

export function wizardEnvValues(input: {
  existing: string;
  slug: string;
  suffix: string;
  storage: StorageAnswer | null;
}): Record<string, string> {
  throw new Error(`not implemented: ${input.slug}`);
}
