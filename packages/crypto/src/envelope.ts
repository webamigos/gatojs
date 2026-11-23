import { AUTH_TAG_LENGTH, IV_LENGTH, open, seal } from "./aes-gcm";

// WHY: the layout base64(IV[12] ‖ ciphertext ‖ tag[16]) is the contract with every stored payload;
// envelope.test.ts pins it with a fixed vector, because a round trip passes when both sides change.
const MIN_PAYLOAD_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH;

export function encryptContent(plaintext: string, dataKey: Buffer): string {
  return seal(Buffer.from(plaintext, "utf8"), dataKey).toString("base64");
}

export function decryptContent(payload: string, dataKey: Buffer): string {
  const packed = Buffer.from(payload, "base64");
  if (packed.length < MIN_PAYLOAD_LENGTH) {
    throw new Error(
      `Invalid encrypted payload: expected at least ${MIN_PAYLOAD_LENGTH} bytes, got ${packed.length}`,
    );
  }
  return open(packed, dataKey).toString("utf8");
}
