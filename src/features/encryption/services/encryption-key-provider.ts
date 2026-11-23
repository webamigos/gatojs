import "server-only";

import {
  assertEncryptionAvailable,
  LocalKeyProvider,
  probeEncryptionProvider,
  type EncryptionProbeResult,
  type KeyProvider,
} from "@gatojs/crypto";
import { env, type CoreEnv } from "@/env";
import type { EncryptionEnv } from "../env";

let provider: KeyProvider | undefined;
let probe: Promise<EncryptionProbeResult> | undefined;

export function encryptionKeyProvider(): KeyProvider {
  provider ??= new LocalKeyProvider(
    (env as CoreEnv & EncryptionEnv).ENCRYPTION_MASTER_KEY,
  );
  return provider;
}

export async function ensureEncryptionAvailable(): Promise<void> {
  probe ??= probeEncryptionProvider(encryptionKeyProvider());
  assertEncryptionAvailable(await probe);
}
