import { describe, expect, it } from "vitest";
import {
  assertEncryptionAvailable,
  EncryptionUnavailableError,
} from "../assert-encryption-available";
import * as cryptoPackage from "../index";

describe("assertEncryptionAvailable", () => {
  it("returns for a passing probe", () => {
    expect(assertEncryptionAvailable({ status: "ok" })).toBeUndefined();
  });

  it("throws EncryptionUnavailableError carrying the probe detail", () => {
    let caught: unknown;
    try {
      assertEncryptionAvailable({
        status: "misconfigured",
        detail: "access denied to decrypt",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EncryptionUnavailableError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe("EncryptionUnavailableError");
    expect((caught as Error).message).toBe(
      "Encryption is unavailable: access denied to decrypt",
    );
  });

  it("throws for a misconfigured probe with an empty detail", () => {
    expect(() =>
      assertEncryptionAvailable({ status: "misconfigured", detail: "" }),
    ).toThrow(EncryptionUnavailableError);
  });
});

describe("the @gatojs/crypto entry point", () => {
  it("exports the whole public API", () => {
    expect(Object.keys(cryptoPackage)).toEqual(
      expect.arrayContaining([
        "EncryptionUnavailableError",
        "LocalKeyProvider",
        "assertEncryptionAvailable",
        "decryptContent",
        "encryptContent",
        "parseMasterKey",
        "probeEncryptionProvider",
      ]),
    );
  });
});
