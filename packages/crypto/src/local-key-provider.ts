import type { GeneratedDataKey, KeyProvider } from "./key-provider";

export class LocalKeyProvider implements KeyProvider {
  constructor(masterKey: string) {
    throw new Error(`not implemented ${masterKey.length}`);
  }

  async generateDataKey(): Promise<GeneratedDataKey> {
    throw new Error("not implemented");
  }

  async unwrapDataKey(wrappedKey: string): Promise<Buffer> {
    throw new Error(`not implemented ${wrappedKey.length}`);
  }
}
