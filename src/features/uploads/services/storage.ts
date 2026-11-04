import { env, type CoreEnv } from "@/shared/lib/env";
import type {
  ObjectStorage,
  StorageEnv,
  StoredObject,
} from "../contracts/storage.types";
import type { UploadsEnv } from "../env";
import { createLocalStorage } from "./local-storage";
import { createS3Storage } from "./s3-storage";

export type { StoredObject } from "../contracts/storage.types";

export function createObjectStorage(config: StorageEnv): ObjectStorage {
  if (config.STORAGE_PROVIDER === "local") {
    return createLocalStorage(config.STORAGE_LOCAL_PATH);
  }
  return createS3Storage(config);
}

let cachedStorage: ObjectStorage | undefined;

function storage(): ObjectStorage {
  cachedStorage ??= createObjectStorage(env as CoreEnv & UploadsEnv);
  return cachedStorage;
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await storage().put(key, body, contentType);
}

export async function getObject(key: string): Promise<StoredObject | null> {
  return storage().get(key);
}

export async function deleteObject(key: string): Promise<void> {
  await storage().delete(key);
}
