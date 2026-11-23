import { parseMasterKey } from "@gatojs/crypto";
import { blankAsUndefined, requiredForProvider } from "@gatojs/env";
import { z } from "zod";

export const EXAMPLE_ENCRYPTION_MASTER_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

export interface EncryptionEnv {
  ENCRYPTION_PROVIDER: "local";
  ENCRYPTION_MASTER_KEY: string;
}

const MASTER_KEY = "ENCRYPTION_MASTER_KEY";

function masterKeyProblem(key: string): string | null {
  try {
    parseMasterKey(key);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export const envSchema = z
  .object({
    ENCRYPTION_PROVIDER: blankAsUndefined(
      z.enum(["local"]).optional(),
    ).transform((provider) => provider ?? "local"),
    ENCRYPTION_MASTER_KEY: blankAsUndefined(z.string().optional()),
    NODE_ENV: z.string().optional(),
  })
  .superRefine(
    requiredForProvider("ENCRYPTION_PROVIDER", "local", [MASTER_KEY]),
  )
  .superRefine((value, context) => {
    const key = value.ENCRYPTION_MASTER_KEY?.trim();
    if (key === undefined) {
      return;
    }
    const problem = masterKeyProblem(key);
    if (problem !== null) {
      context.addIssue({
        code: "custom",
        path: [MASTER_KEY],
        message: problem,
      });
      return;
    }
    if (
      value.NODE_ENV === "production" &&
      key === EXAMPLE_ENCRYPTION_MASTER_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: [MASTER_KEY],
        message: "must not be the .env.example value in production",
      });
    }
  })
  .transform((value): EncryptionEnv => ({
    ENCRYPTION_PROVIDER: value.ENCRYPTION_PROVIDER,
    ENCRYPTION_MASTER_KEY: value.ENCRYPTION_MASTER_KEY?.trim() ?? "",
  }));
