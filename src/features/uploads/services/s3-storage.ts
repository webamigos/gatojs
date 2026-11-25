import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectStorage, S3StorageEnv } from "../contracts/storage.types";

export function createS3Storage(config: S3StorageEnv): ObjectStorage {
  let cachedClient: S3Client | undefined;

  function client(): S3Client {
    cachedClient ??= new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        ...(config.S3_SESSION_TOKEN
          ? { sessionToken: config.S3_SESSION_TOKEN }
          : {}),
      },
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    return cachedClient;
  }

  return {
    async put(key, body, contentType) {
      await client().send(
        new PutObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      try {
        const result = await client().send(
          new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
        );
        const body = await result.Body?.transformToByteArray();
        return {
          body: body ?? new Uint8Array(),
          contentType: result.ContentType,
        };
      } catch (error) {
        if (
          error instanceof NoSuchKey ||
          (error instanceof Error && error.name === "NoSuchKey")
        ) {
          return null;
        }
        throw error;
      }
    },
    async delete(key) {
      await client().send(
        new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
      );
    },
  };
}
