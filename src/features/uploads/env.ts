import { z } from "zod";
import type { StorageEnv } from "./contracts/storage.types";
import { resolveStorageEnv } from "./services/storage-env";

const optionalText = z.string().optional();

export const envSchema = z
  .object({
    NODE_ENV: optionalText,
    STORAGE_PROVIDER: optionalText,
    STORAGE_LOCAL_PATH: optionalText,
    RAILWAY_ENVIRONMENT_ID: optionalText,
    RAILWAY_VOLUME_MOUNT_PATH: optionalText,
    S3_ENDPOINT: optionalText,
    S3_REGION: optionalText,
    S3_ACCESS_KEY_ID: optionalText,
    S3_SECRET_ACCESS_KEY: optionalText,
    S3_BUCKET: optionalText,
    S3_FORCE_PATH_STYLE: optionalText,
  })
  .transform((source, context) => {
    const result = resolveStorageEnv(source, process.cwd());
    if (result.ok) {
      return result.env;
    }
    for (const { name, message } of result.issues) {
      context.addIssue({ code: "custom", path: [name], message });
    }
    return z.NEVER;
  });

export type UploadsEnv = StorageEnv;
