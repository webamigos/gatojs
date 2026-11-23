import type { StorageAnswer } from "./questions.js";

export const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const SUFFIX_LENGTH = 6;

const COMPOSE_PROJECT_NAME = "COMPOSE_PROJECT_NAME";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function linePattern(key: string): RegExp {
  return new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
}

export function setEnvValues(
  text: string,
  values: Record<string, string>,
): string {
  let result = text;
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = linePattern(key);
    if (pattern.test(result)) {
      result = result.replace(pattern, () => line);
      continue;
    }
    const separator = result === "" || result.endsWith("\n") ? "" : "\n";
    result = `${result}${separator}${line}\n`;
  }
  return result;
}

export function readEnvValue(text: string, key: string): string | null {
  const match = linePattern(key).exec(text);
  return match === null ? null : match[0].slice(key.length + 1);
}

export function randomSuffix(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, SUFFIX_LENGTH), (byte) =>
    SUFFIX_ALPHABET.charAt(byte % SUFFIX_ALPHABET.length),
  ).join("");
}

export function composeProjectName(slug: string, suffix: string): string {
  return `${slug}-${suffix}`;
}

function storageValues(storage: StorageAnswer | null): Record<string, string> {
  if (storage === null) {
    return {};
  }
  if (storage.provider === "local") {
    return { STORAGE_PROVIDER: "local" };
  }
  return {
    STORAGE_PROVIDER: "s3",
    S3_ENDPOINT: storage.endpoint,
    S3_ACCESS_KEY_ID: storage.accessKeyId,
    S3_SECRET_ACCESS_KEY: storage.secretAccessKey,
  };
}

export function wizardEnvValues(input: {
  existing: string;
  slug: string;
  suffix: string;
  storage: StorageAnswer | null;
}): Record<string, string> {
  const values: Record<string, string> = {};
  if (readEnvValue(input.existing, COMPOSE_PROJECT_NAME) === null) {
    values[COMPOSE_PROJECT_NAME] = composeProjectName(input.slug, input.suffix);
  }
  return { ...values, ...storageValues(input.storage) };
}
