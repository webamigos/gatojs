import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { decryptContent, encryptContent } from "../envelope";

const DEK = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);
const PLAINTEXT = "Ragen envelope format v1 — do not change";
const VECTOR =
  "oKGio6SlpqeoqaqrtHkbSCvrZ9EUAOu8dx/guB/eNHHmlzRdvOymEl/PGiG8GTPfzEoyUzj5THvQALzBbO3cYXZHI5zGTg==";

function decodedLength(payload: string): number {
  return Buffer.from(payload, "base64").length;
}

describe("the envelope format", () => {
  it("decrypts a payload encrypted before this package existed", () => {
    expect(decryptContent(VECTOR, DEK)).toBe(PLAINTEXT);
  });

  it("lays the fixed vector out as IV(12) ‖ ciphertext ‖ tag(16)", () => {
    const packed = Buffer.from(VECTOR, "base64");

    expect(packed.length).toBe(12 + 42 + 16);
    expect(packed.subarray(0, 12).toString("hex")).toBe(
      "a0a1a2a3a4a5a6a7a8a9aaab",
    );
  });

  it("writes new payloads as 12 bytes of IV, the ciphertext and 16 bytes of tag", () => {
    expect(decodedLength(encryptContent("hello", DEK))).toBe(12 + 5 + 16);
    expect(decodedLength(encryptContent("zażółć", DEK))).toBe(12 + 10 + 16);
  });

  it("writes an empty plaintext as exactly 28 bytes and reads it back", () => {
    const payload = encryptContent("", DEK);

    expect(decodedLength(payload)).toBe(28);
    expect(decryptContent(payload, DEK)).toBe("");
  });

  it("round-trips new content without leaking the plaintext", () => {
    const encrypted = encryptContent("hello", DEK);

    expect(encrypted).not.toContain("hello");
    expect(decryptContent(encrypted, DEK)).toBe("hello");
  });

  it.each([
    ["unicode", "zażółć gęślą jaźń — 中文 — 🔐"],
    ["a long body", "x".repeat(100_000)],
  ])("round-trips %s", (_name, plaintext) => {
    expect(decryptContent(encryptContent(plaintext, DEK), DEK)).toBe(plaintext);
  });

  test.prop([fc.string({ unit: "grapheme" })])(
    "round-trips any string",
    (plaintext) => {
      expect(decryptContent(encryptContent(plaintext, DEK), DEK)).toBe(
        plaintext,
      );
    },
  );

  test.prop([fc.uint8Array({ minLength: 32, maxLength: 32 }), fc.string()])(
    "decrypts with the key it encrypted with and rejects a different key",
    (keyBytes, plaintext) => {
      const key = Buffer.from(keyBytes);
      const other = Buffer.from(keyBytes.map((byte) => byte ^ 0x01));
      const payload = encryptContent(plaintext, key);

      expect(decryptContent(payload, key)).toBe(plaintext);
      expect(() => decryptContent(payload, other)).toThrow();
    },
  );

  it("uses a fresh IV every time, so identical input differs", () => {
    const first = Buffer.from(encryptContent("same", DEK), "base64");
    const second = Buffer.from(encryptContent("same", DEK), "base64");

    expect(first.toString("base64")).not.toBe(second.toString("base64"));
    expect(first.subarray(0, 12).equals(second.subarray(0, 12))).toBe(false);
  });

  it("rejects a payload too short to hold an IV and a tag, naming its length", () => {
    expect(() =>
      decryptContent(Buffer.alloc(20).toString("base64"), DEK),
    ).toThrow("Invalid encrypted payload: expected at least 28 bytes, got 20");
  });

  it("rejects a 27-byte payload as too short", () => {
    expect(() =>
      decryptContent(Buffer.alloc(27).toString("base64"), DEK),
    ).toThrow("Invalid encrypted payload: expected at least 28 bytes, got 27");
  });

  it("does not report a 28-byte payload as too short", () => {
    expect(() =>
      decryptContent(Buffer.alloc(28).toString("base64"), DEK),
    ).not.toThrow(/expected at least/);
    expect(() =>
      decryptContent(Buffer.alloc(28).toString("base64"), DEK),
    ).toThrow();
  });

  it("rejects a tampered ciphertext byte rather than returning wrong plaintext", () => {
    const packed = Buffer.from(encryptContent("hello", DEK), "base64");
    packed[14] ^= 0xff;

    expect(() => decryptContent(packed.toString("base64"), DEK)).toThrow();
  });

  it("rejects a tampered tag byte", () => {
    const packed = Buffer.from(VECTOR, "base64");
    packed[packed.length - 1] ^= 0x01;

    expect(() => decryptContent(packed.toString("base64"), DEK)).toThrow();
  });

  it("rejects a tampered IV byte", () => {
    const packed = Buffer.from(VECTOR, "base64");
    packed[0] ^= 0x01;

    expect(() => decryptContent(packed.toString("base64"), DEK)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decryptContent(VECTOR, Buffer.alloc(32, 7))).toThrow();
  });
});
