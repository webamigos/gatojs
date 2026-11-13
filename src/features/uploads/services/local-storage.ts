import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage } from "../contracts/storage.types";
import { isPathInside } from "./path-inside";

export class InvalidStorageKeyError extends Error {
  constructor() {
    super("Nieprawidłowy klucz obiektu");
    this.name = "InvalidStorageKeyError";
  }
}

export function resolveObjectPath(root: string, key: string): string {
  if (
    key.includes("\0") ||
    path.isAbsolute(key) ||
    key.split(/[\\/]/).includes("..")
  ) {
    throw new InvalidStorageKeyError();
  }
  const resolved = path.resolve(root, key);
  if (!isPathInside(root, resolved) || resolved === path.resolve(root)) {
    throw new InvalidStorageKeyError();
  }
  return resolved;
}

function isMissingObjectError(error: unknown): boolean {
  const { code } = error as NodeJS.ErrnoException;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}

export function createLocalStorage(root: string): ObjectStorage {
  return {
    async put(key, body) {
      const objectPath = resolveObjectPath(root, key);
      await mkdir(path.dirname(objectPath), { recursive: true });
      await writeFile(objectPath, body);
    },
    async get(key) {
      const objectPath = resolveObjectPath(root, key);
      try {
        return { body: await readFile(objectPath), contentType: undefined };
      } catch (error) {
        if (isMissingObjectError(error)) {
          return null;
        }
        throw error;
      }
    },
    async delete(key) {
      await rm(resolveObjectPath(root, key), { force: true });
    },
  };
}
