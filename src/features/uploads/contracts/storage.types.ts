export interface StoredObject {
  body: Uint8Array;
  contentType: string | undefined;
}

export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}
