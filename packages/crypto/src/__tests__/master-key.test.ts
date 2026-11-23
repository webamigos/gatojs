import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { parseMasterKey } from "../master-key";

const RAW_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const RAW_BASE64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const GENERATION_COMMAND = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;

const keyBytes = fc.uint8Array({ minLength: 32, maxLength: 32 });
const whitespace = fc.constantFrom("", " ", "  ", "\n", "\t", " \r\n ");

function expectRejected(key: string): void {
  let caught: unknown;
  try {
    parseMasterKey(key);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const message = (caught as Error).message;
  expect(message).toContain("64-character hex");
  expect(message).toContain("base64");
  expect(message).toContain(GENERATION_COMMAND);
}

describe("parseMasterKey", () => {
  it("reads the 64-character hex form .env.example documents", () => {
    expect(parseMasterKey(RAW_HEX).toString("hex")).toBe(RAW_HEX);
  });

  it("reads upper-case hex", () => {
    expect(parseMasterKey(RAW_HEX.toUpperCase()).toString("hex")).toBe(RAW_HEX);
  });

  it("reads a 32-byte base64 key", () => {
    expect(parseMasterKey(RAW_BASE64).toString("hex")).toBe(RAW_HEX);
  });

  it("reads hex as hex, not as 48 bytes of base64", () => {
    expect(Buffer.from(RAW_HEX, "base64").length).toBe(48);
    expect(parseMasterKey(RAW_HEX).length).toBe(32);
    expect(parseMasterKey(RAW_HEX).toString("hex")).toBe(RAW_HEX);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseMasterKey(`  ${RAW_HEX}\n`).toString("hex")).toBe(RAW_HEX);
    expect(parseMasterKey(`\t${RAW_BASE64}  `).toString("hex")).toBe(RAW_HEX);
  });

  test.prop([keyBytes, whitespace, whitespace])(
    "reads the hex of any 32 bytes back to those bytes, padded or not",
    (bytes, before, after) => {
      const raw = Buffer.from(bytes);
      const parsed = parseMasterKey(`${before}${raw.toString("hex")}${after}`);

      expect(parsed.length).toBe(32);
      expect(parsed.equals(raw)).toBe(true);
    },
  );

  test.prop([keyBytes])(
    "reads upper-case hex of any 32 bytes back to those bytes",
    (bytes) => {
      const raw = Buffer.from(bytes);

      expect(
        parseMasterKey(raw.toString("hex").toUpperCase()).equals(raw),
      ).toBe(true);
    },
  );

  test.prop([keyBytes, whitespace, whitespace])(
    "reads the base64 of any 32 bytes back to those bytes, padded or not",
    (bytes, before, after) => {
      const raw = Buffer.from(bytes);
      const parsed = parseMasterKey(
        `${before}${raw.toString("base64")}${after}`,
      );

      expect(parsed.length).toBe(32);
      expect(parsed.equals(raw)).toBe(true);
    },
  );

  test.prop([
    fc
      .uint8Array({ minLength: 1, maxLength: 64 })
      .filter(
        (bytes) =>
          bytes.length !== 32 &&
          !/^[0-9a-f]{64}$/i.test(Buffer.from(bytes).toString("base64")),
      ),
  ])("rejects the base64 of any length other than 32 bytes", (bytes) => {
    expectRejected(Buffer.from(bytes).toString("base64"));
  });

  it("rejects base64 of 48 bytes with the generation hint", () => {
    expectRejected(Buffer.alloc(48, 9).toString("base64"));
  });

  it("rejects an invalid key with the exact message from the spec, generation hint included", () => {
    let caught: unknown;
    try {
      parseMasterKey(Buffer.alloc(48, 9).toString("base64"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      `ENCRYPTION_MASTER_KEY must be 32 bytes: a 64-character hex string or base64. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  });

  it("rejects base64 of 31 and 33 bytes", () => {
    expectRejected(Buffer.alloc(31, 9).toString("base64"));
    expectRejected(Buffer.alloc(33, 9).toString("base64"));
  });

  it("rejects a 64-character string that is base64 but not hex", () => {
    expectRejected("g".repeat(64));
  });

  it("rejects a hex string of 32 characters", () => {
    expectRejected("ab".repeat(16));
  });

  it("rejects a hex string of 62 and 66 characters", () => {
    expectRejected("ab".repeat(31));
    expectRejected("ab".repeat(33));
  });

  it("rejects anything else, naming both accepted forms and the generation command", () => {
    expectRejected("too-short");
  });

  it("rejects an empty or blank key", () => {
    expectRejected("");
    expectRejected("   ");
  });
});
