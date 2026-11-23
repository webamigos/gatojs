import { z } from "zod";

export const EXAMPLE_ENCRYPTION_MASTER_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

export interface EncryptionEnv {
  ENCRYPTION_PROVIDER: "local";
  ENCRYPTION_MASTER_KEY: string;
}

export const envSchema = z.object({}).transform((): EncryptionEnv => {
  throw new Error("not implemented");
});
