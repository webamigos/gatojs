import fs from "node:fs";
import path from "node:path";
import { readRepoFile } from "./repo-files";

export interface MissingKey {
  locale: string;
  key: string;
}

const SHARED_MESSAGES_DIRECTORY = "src/app/messages";
const FEATURES_DIRECTORY = "src/features";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function leafKeys(messages: unknown, prefix: string): string[] {
  if (!isPlainObject(messages)) {
    return [prefix];
  }
  return Object.entries(messages).flatMap(([key, value]) =>
    leafKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

export function findMissingKeys(
  byLocale: Record<string, unknown>,
): MissingKey[] {
  const keysByLocale = Object.entries(byLocale).map(
    ([locale, messages]) => [locale, new Set(leafKeys(messages, ""))] as const,
  );
  const allKeys = new Set(keysByLocale.flatMap(([, keys]) => [...keys]));
  return keysByLocale.flatMap(([locale, keys]) =>
    [...allKeys]
      .filter((key) => !keys.has(key))
      .sort()
      .map((key) => ({ locale, key })),
  );
}

function messageDirectories(root: string): string[] {
  const featuresPath = path.join(root, FEATURES_DIRECTORY);
  const featureDirectories = fs.existsSync(featuresPath)
    ? fs
        .readdirSync(featuresPath)
        .sort()
        .map((feature) => `${FEATURES_DIRECTORY}/${feature}/i18n`)
    : [];
  return [SHARED_MESSAGES_DIRECTORY, ...featureDirectories].filter(
    (directory) => fs.existsSync(path.join(root, directory)),
  );
}

function checkDirectory(
  root: string,
  directory: string,
  locales: readonly string[],
): string[] {
  const fileOf = (locale: string) => `${directory}/${locale}.json`;
  const present = locales.filter((locale) =>
    fs.existsSync(path.join(root, fileOf(locale))),
  );
  const missingFiles = locales
    .filter((locale) => !present.includes(locale))
    .map((locale) => `${fileOf(locale)}: file missing`);
  const byLocale = Object.fromEntries(
    present.map((locale) => [
      locale,
      JSON.parse(readRepoFile(root, fileOf(locale))) as unknown,
    ]),
  );
  const missingKeys = findMissingKeys(byLocale).map(
    ({ locale, key }) => `${fileOf(locale)}: ${key}`,
  );
  return [...missingFiles, ...missingKeys];
}

export function checkI18nKeys(
  root: string,
  locales: readonly string[],
): string[] {
  return messageDirectories(root).flatMap((directory) =>
    checkDirectory(root, directory, locales),
  );
}
