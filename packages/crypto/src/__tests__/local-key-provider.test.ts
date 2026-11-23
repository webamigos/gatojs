import { describe, expect, it } from "vitest";
import { LocalKeyProvider } from "../local-key-provider";

const MASTER_KEY_HEX =
  "c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf";
const DATA_KEY_HEX =
  "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f";
const WRAPPED_DATA_KEY =
  "sLGys7S1tre4ubq7jbEZyUzC1aC7j7GWwj7nUTTATzkNCQx58/IRB60ynITWDWDeBJI4o7i1vzRrPUFa";
const WRAPPED_16_BYTE_KEY =
  "sLGys7S1tre4ubq7+MVuvz2yptLG887ou0acK/OBGoUeORu05V2ts7eOy+k=";
const OTHER_MASTER_KEY_HEX = "11".repeat(32);

function decoded(wrappedKey: string): Buffer {
  return Buffer.from(wrappedKey, "base64");
}

describe("LocalKeyProvider", () => {
  it("unwraps a data key wrapped before this package existed", async () => {
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    const key = await provider.unwrapDataKey(WRAPPED_DATA_KEY);

    expect(key.toString("hex")).toBe(DATA_KEY_HEX);
  });

  it("lays the fixed wrapped key out as IV(12) ‖ wrapped key(32) ‖ tag(16)", () => {
    const packed = decoded(WRAPPED_DATA_KEY);

    expect(packed.length).toBe(60);
    expect(packed.subarray(0, 12).toString("hex")).toBe(
      "b0b1b2b3b4b5b6b7b8b9babb",
    );
  });

  it("accepts the master key as base64 and with surrounding whitespace", async () => {
    const base64 = Buffer.from(MASTER_KEY_HEX, "hex").toString("base64");

    for (const masterKey of [base64, `  ${MASTER_KEY_HEX}\n`]) {
      const key = await new LocalKeyProvider(masterKey).unwrapDataKey(
        WRAPPED_DATA_KEY,
      );
      expect(key.toString("hex")).toBe(DATA_KEY_HEX);
    }
  });

  it("generates a 32-byte data key and a 60-byte wrapped key", async () => {
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    const { plaintextKey, wrappedKey } = await provider.generateDataKey();

    expect(plaintextKey.length).toBe(32);
    expect(decoded(wrappedKey).length).toBe(60);
  });

  it("unwraps a generated key back to the same bytes", async () => {
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    const { plaintextKey, wrappedKey } = await provider.generateDataKey();
    const unwrapped = await provider.unwrapDataKey(wrappedKey);

    expect(unwrapped.equals(plaintextKey)).toBe(true);
  });

  it("does not leak the data key into the wrapped key", async () => {
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    const { plaintextKey, wrappedKey } = await provider.generateDataKey();

    expect(decoded(wrappedKey).includes(plaintextKey)).toBe(false);
  });

  it("generates a different data key and IV on every call", async () => {
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    const first = await provider.generateDataKey();
    const second = await provider.generateDataKey();

    expect(first.plaintextKey.equals(second.plaintextKey)).toBe(false);
    expect(
      decoded(first.wrappedKey)
        .subarray(0, 12)
        .equals(decoded(second.wrappedKey).subarray(0, 12)),
    ).toBe(false);
  });

  it("lets another provider with the same master key unwrap", async () => {
    const { plaintextKey, wrappedKey } = await new LocalKeyProvider(
      MASTER_KEY_HEX,
    ).generateDataKey();

    const unwrapped = await new LocalKeyProvider(MASTER_KEY_HEX).unwrapDataKey(
      wrappedKey,
    );

    expect(unwrapped.equals(plaintextKey)).toBe(true);
  });

  it("refuses to unwrap with a different master key", async () => {
    const provider = new LocalKeyProvider(OTHER_MASTER_KEY_HEX);

    await expect(provider.unwrapDataKey(WRAPPED_DATA_KEY)).rejects.toThrow();
  });

  it("refuses a tampered wrapped key", async () => {
    const packed = decoded(WRAPPED_DATA_KEY);
    packed[20] ^= 0x01;
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    await expect(
      provider.unwrapDataKey(packed.toString("base64")),
    ).rejects.toThrow();
  });

  it("refuses a wrapped key with a tampered tag", async () => {
    const packed = decoded(WRAPPED_DATA_KEY);
    packed[59] ^= 0x01;
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    await expect(
      provider.unwrapDataKey(packed.toString("base64")),
    ).rejects.toThrow();
  });

  it("refuses a wrapped key shorter than 29 bytes, naming its length", async () => {
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    await expect(
      provider.unwrapDataKey(Buffer.alloc(28).toString("base64")),
    ).rejects.toThrow(
      "Invalid wrapped key: expected at least 29 bytes, got 28",
    );
    await expect(
      provider.unwrapDataKey(Buffer.alloc(10).toString("base64")),
    ).rejects.toThrow(
      "Invalid wrapped key: expected at least 29 bytes, got 10",
    );
  });

  it("does not report a 29-byte wrapped key as too short", async () => {
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);
    const attempt = provider.unwrapDataKey(Buffer.alloc(29).toString("base64"));

    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toThrow(/expected at least/);
  });

  it("refuses an authentic wrapped key that does not hold 32 bytes", async () => {
    const provider = new LocalKeyProvider(MASTER_KEY_HEX);

    await expect(provider.unwrapDataKey(WRAPPED_16_BYTE_KEY)).rejects.toThrow(
      "Invalid data key length: expected 32 bytes, got 16",
    );
  });

  it("rejects a malformed master key with the parseMasterKey error", () => {
    expect(() => new LocalKeyProvider("too-short")).toThrow("64-character hex");
    expect(() => new LocalKeyProvider("too-short")).toThrow(
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  });
});
