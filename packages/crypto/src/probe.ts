import type { KeyProvider } from "./key-provider";

const DATA_KEY_LENGTH = 32;

export type EncryptionProbeResult =
  { status: "ok" } | { status: "misconfigured"; detail: string };

function misconfigured(detail: string): EncryptionProbeResult {
  return { status: "misconfigured", detail };
}

// WHY: never rejects, so a boot or first-use check reports the provider problem instead of crashing on it.
export async function probeEncryptionProvider(
  provider: KeyProvider,
): Promise<EncryptionProbeResult> {
  try {
    const { wrappedKey, plaintextKey } = await provider.generateDataKey();
    if (plaintextKey.length !== DATA_KEY_LENGTH) {
      return misconfigured(
        `the provider generated a ${plaintextKey.length}-byte data key, expected ${DATA_KEY_LENGTH} bytes`,
      );
    }
    const unwrapped = await provider.unwrapDataKey(wrappedKey);
    if (!unwrapped.equals(plaintextKey)) {
      return misconfigured(
        "the provider unwrapped a data key to different bytes than it wrapped",
      );
    }
    return { status: "ok" };
  } catch (error) {
    return misconfigured(
      error instanceof Error ? error.message : String(error),
    );
  }
}
