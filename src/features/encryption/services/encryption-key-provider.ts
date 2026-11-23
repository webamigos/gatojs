import "server-only";

import type { KeyProvider } from "@gatojs/crypto";

export function encryptionKeyProvider(): KeyProvider {
  throw new Error("not implemented");
}

export async function ensureEncryptionAvailable(): Promise<void> {
  throw new Error("not implemented");
}
