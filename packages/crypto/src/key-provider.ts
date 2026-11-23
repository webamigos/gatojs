export interface GeneratedDataKey {
  wrappedKey: string;
  plaintextKey: Buffer;
}

export interface KeyProvider {
  generateDataKey(): Promise<GeneratedDataKey>;
  unwrapDataKey(wrappedKey: string): Promise<Buffer>;
}
