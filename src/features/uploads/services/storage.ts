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

function client(): S3Client {
  cachedClient ??= new S3Client({
    endpoint: uploadsEnv().S3_ENDPOINT,
    region: uploadsEnv().S3_REGION,
    credentials: {
      accessKeyId: uploadsEnv().S3_ACCESS_KEY_ID,
      secretAccessKey: uploadsEnv().S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: uploadsEnv().S3_FORCE_PATH_STYLE,
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
  await client().send(
    new PutObjectCommand({
      Bucket: uploadsEnv().S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObject(key: string): Promise<StoredObject | null> {
  try {
    const result = await client().send(
      new GetObjectCommand({ Bucket: uploadsEnv().S3_BUCKET, Key: key }),
    );
    const body = await result.Body?.transformToByteArray();
    return { body: body ?? new Uint8Array(), contentType: result.ContentType };
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return null;
    }
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({ Bucket: uploadsEnv().S3_BUCKET, Key: key }),
  );
}
