import path from "node:path";
import { httpUrl } from "@gatojs/env";
import { z } from "zod";
import type { StorageEnv } from "../contracts/storage.types";
import { isPathInside } from "./path-inside";

export const DEFAULT_LOCAL_STORAGE_PATH = "./volumes/uploads";

export interface StorageEnvIssue {
  name: string;
  message: string;
}

export type StorageEnvResult =
  { ok: true; env: StorageEnv } | { ok: false; issues: StorageEnvIssue[] };

type EnvSource = Readonly<Record<string, string | undefined>>;

const pathStyleFlag = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const s3EnvSchema = z.object({
  S3_ENDPOINT: httpUrl(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: pathStyleFlag,
});

function trimmedOrUndefined(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function invalid(name: string, message: string): StorageEnvResult {
  return { ok: false, issues: [{ name, message }] };
}

function resolveS3Env(source: EnvSource): StorageEnvResult {
  const result = s3EnvSchema.safeParse(source);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => ({
        name: String(issue.path[0]),
        message: issue.message,
      })),
    };
  }
  return { ok: true, env: { STORAGE_PROVIDER: "s3", ...result.data } };
}

function resolveLocalEnv(source: EnvSource, cwd: string): StorageEnvResult {
  const explicit = trimmedOrUndefined(source.STORAGE_LOCAL_PATH);
  const volume = trimmedOrUndefined(source.RAILWAY_VOLUME_MOUNT_PATH);
  if (source.NODE_ENV === "production") {
    const onRailway =
      trimmedOrUndefined(source.RAILWAY_ENVIRONMENT_ID) !== undefined;
    if (onRailway && !volume) {
      return invalid(
        "STORAGE_PROVIDER",
        "on Railway without a volume, files are lost on redeploy: attach a volume or set STORAGE_PROVIDER=s3",
      );
    }
    if (
      onRailway &&
      volume &&
      explicit &&
      !isPathInside(path.resolve(cwd, volume), path.resolve(cwd, explicit))
    ) {
      return invalid(
        "STORAGE_LOCAL_PATH",
        `must be inside the Railway volume (${volume})`,
      );
    }
    if (!onRailway && !explicit) {
      return invalid(
        "STORAGE_LOCAL_PATH",
        "required in production with STORAGE_PROVIDER=local: point it at a persistent directory",
      );
    }
    if (!onRailway && explicit && !path.isAbsolute(explicit)) {
      return invalid(
        "STORAGE_LOCAL_PATH",
        "must be an absolute path in production outside Railway: point it at a persistent directory",
      );
    }
  }
  return {
    ok: true,
    env: {
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: path.resolve(
        cwd,
        explicit ?? volume ?? DEFAULT_LOCAL_STORAGE_PATH,
      ),
    },
  };
}

export function resolveStorageEnv(
  source: EnvSource,
  cwd: string,
): StorageEnvResult {
  const provider =
    trimmedOrUndefined(source.STORAGE_PROVIDER)?.toLowerCase() ?? "local";
  if (provider === "local") {
    return resolveLocalEnv(source, cwd);
  }
  if (provider === "s3") {
    return resolveS3Env(source);
  }
  return invalid("STORAGE_PROVIDER", "allowed values: local, s3");
}
