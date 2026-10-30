import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env, type CoreEnv } from "@/shared/lib/env";
import type { UploadsEnv } from "../env";

export interface StoredObject {
  body: Uint8Array;
  contentType: string | undefined;
}

function uploadsEnv(): CoreEnv & UploadsEnv {
  return env as CoreEnv & UploadsEnv;
}

let cachedClient: S3Client | undefined;

function client(config: UploadsEnv): S3Client {
  cachedClient ??= new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cachedClient;
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const config = uploadsEnv();
  await client(config).send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObject(key: string): Promise<StoredObject | null> {
  const config = uploadsEnv();
  try {
    const result = await client(config).send(
      new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
    );
    const body = await result.Body?.transformToByteArray();
    return { body: body ?? new Uint8Array(), contentType: result.ContentType };
  } catch (error) {
    if (
      error instanceof NoSuchKey ||
      (error instanceof Error && error.name === "NoSuchKey")
    ) {
      return null;
    }
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const config = uploadsEnv();
  await client(config).send(
    new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
  );
}
