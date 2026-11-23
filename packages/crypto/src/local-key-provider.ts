import { randomBytes } from "node:crypto";
import { AUTH_TAG_LENGTH, IV_LENGTH, open, seal } from "./aes-gcm";
import type { GeneratedDataKey, KeyProvider } from "./key-provider";
import { parseMasterKey } from "./master-key";

const DATA_KEY_LENGTH = 32;
const MIN_WRAPPED_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH + 1;

export class LocalKeyProvider implements KeyProvider {
  private readonly masterKey: Buffer;

  constructor(masterKey: string) {
    this.masterKey = parseMasterKey(masterKey);
  }

  async generateDataKey(): Promise<GeneratedDataKey> {
    const plaintextKey = randomBytes(DATA_KEY_LENGTH);
    return {
      wrappedKey: seal(plaintextKey, this.masterKey).toString("base64"),
      plaintextKey,
    };
  }

  async unwrapDataKey(wrappedKey: string): Promise<Buffer> {
    const packed = Buffer.from(wrappedKey, "base64");
    if (packed.length < MIN_WRAPPED_LENGTH) {
      throw new Error(
        `Invalid wrapped key: expected at least ${MIN_WRAPPED_LENGTH} bytes, got ${packed.length}`,
      );
    }
    const dataKey = open(packed, this.masterKey);
    if (dataKey.length !== DATA_KEY_LENGTH) {
      throw new Error(
        `Invalid data key length: expected ${DATA_KEY_LENGTH} bytes, got ${dataKey.length}`,
      );
    }
    return dataKey;
  }
}
