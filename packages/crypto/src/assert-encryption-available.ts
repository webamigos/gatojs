import type { EncryptionProbeResult } from "./probe";

export class EncryptionUnavailableError extends Error {
  name = "EncryptionUnavailableError";
}

export function assertEncryptionAvailable(result: EncryptionProbeResult): void {
  if (result.status === "misconfigured") {
    throw new EncryptionUnavailableError(
      `Encryption is unavailable: ${result.detail}`,
    );
  }
}
