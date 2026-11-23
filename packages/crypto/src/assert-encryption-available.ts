import type { EncryptionProbeResult } from "./probe";

export class EncryptionUnavailableError extends Error {
  name = "EncryptionUnavailableError";
}

export function assertEncryptionAvailable(result: EncryptionProbeResult): void {
  throw new Error(`not implemented ${result.status}`);
}
