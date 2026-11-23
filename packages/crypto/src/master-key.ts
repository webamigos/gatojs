const KEY_LENGTH = 32;
const HEX_KEY = /^[0-9a-fA-F]{64}$/;

// WHY: hex is tried first, because a 64-character hex key is also valid base64 that decodes to 48 bytes.
export function parseMasterKey(key: string): Buffer {
  const trimmed = key.trim();
  if (HEX_KEY.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === KEY_LENGTH) {
    return decoded;
  }
  throw new Error(
    "ENCRYPTION_MASTER_KEY must be 32 bytes: a 64-character hex string or base64. " +
      "Generate one with: " +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}
