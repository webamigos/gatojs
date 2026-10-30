import { z } from "zod";

const pathStyleFlag = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

export const envSchema = z
  .object({
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default("auto"),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_FORCE_PATH_STYLE: pathStyleFlag,
  })
  .transform(
    ({
      S3_ENDPOINT,
      S3_REGION,
      S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY,
      S3_BUCKET,
      S3_FORCE_PATH_STYLE,
    }) => ({
      S3_ENDPOINT,
      S3_REGION,
      S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY,
      S3_BUCKET,
      S3_FORCE_PATH_STYLE,
    }),
  );

export type UploadsEnv = z.output<typeof envSchema>;
