export interface StoredObject {
  body: Uint8Array;
  contentType: string | undefined;
}

export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export type LocalStorageEnv = {
  STORAGE_PROVIDER: "local";
  STORAGE_LOCAL_PATH: string;
};

export type S3StorageEnv = {
  STORAGE_PROVIDER: "s3";
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_SESSION_TOKEN?: string;
  S3_BUCKET: string;
  S3_FORCE_PATH_STYLE: boolean;
};

export type StorageEnv = LocalStorageEnv | S3StorageEnv;
