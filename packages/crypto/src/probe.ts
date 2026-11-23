import type { KeyProvider } from "./key-provider";

export type EncryptionProbeResult =
  { status: "ok" } | { status: "misconfigured"; detail: string };

export async function probeEncryptionProvider(
  provider: KeyProvider,
): Promise<EncryptionProbeResult> {
  throw new Error(`not implemented ${typeof provider}`);
}
