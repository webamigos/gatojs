import { describe, expect, it, vi } from "vitest";
import { fc, test } from "@fast-check/vitest";

vi.mock("@/shared/config/project", () => ({
  project: { name: "WA App", slug: "wa-app" },
}));

import { apiKeyPrefix, generateApiKey, hashApiKey } from "../api-key-secret";

const PEPPER = "p".repeat(32);

describe("apiKeyPrefix", () => {
  it("buduje prefiks ze sluga projektu z podkreśleniami", () => {
    expect(apiKeyPrefix()).toBe("wa_app_live_");
  });
});

describe("generateApiKey", () => {
  it("zwraca klucz z prefiksem i 43 znakami base64url (256 bitów)", () => {
    const { plaintext } = generateApiKey("wa_app_live_");
    expect(plaintext).toMatch(/^wa_app_live_[A-Za-z0-9_-]{43}$/);
  });

  it("displayPrefix to prefiks i 6 znaków klucza (długość 18)", () => {
    const { plaintext, displayPrefix } = generateApiKey("wa_app_live_");
    expect(displayPrefix).toHaveLength(18);
    expect(displayPrefix).toBe(plaintext.slice(0, 18));
    expect(displayPrefix).not.toBe(plaintext);
  });

  it("dwa wywołania dają różne klucze", () => {
    const first = generateApiKey("wa_app_live_");
    const second = generateApiKey("wa_app_live_");
    expect(first.plaintext).not.toBe(second.plaintext);
  });

  it("bez argumentu używa prefiksu projektu", () => {
    expect(generateApiKey().plaintext).toMatch(
      /^wa_app_live_[A-Za-z0-9_-]{43}$/,
    );
  });

  it("respektuje podany prefiks o innej długości", () => {
    const { plaintext, displayPrefix } = generateApiKey("x_");
    expect(plaintext).toMatch(/^x_[A-Za-z0-9_-]{43}$/);
    expect(displayPrefix).toHaveLength(8);
  });
});

describe("hashApiKey", () => {
  it("zwraca stały HMAC-SHA256 hex dla znanego wejścia", () => {
    expect(hashApiKey("abc", PEPPER)).toBe(
      "c1bfc511ee5992c4462369624f67e8a20040ad9fac32caa57e7626f62a871caf",
    );
  });

  test.prop([
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 32 }),
    fc.string({ minLength: 32 }),
  ])("inny pepper daje inny hash", (key, pepperA, pepperB) => {
    fc.pre(pepperA !== pepperB);
    expect(hashApiKey(key, pepperA)).not.toBe(hashApiKey(key, pepperB));
  });

  test.prop([fc.string(), fc.string({ minLength: 32 })])(
    "wynik to 64 znaki hex i jest deterministyczny",
    (key, pepper) => {
      const hash = hashApiKey(key, pepper);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hashApiKey(key, pepper)).toBe(hash);
    },
  );

  test.prop([
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 1 }),
    fc.string({ minLength: 32 }),
  ])("inny klucz daje inny hash", (keyA, keyB, pepper) => {
    fc.pre(keyA !== keyB);
    expect(hashApiKey(keyA, pepper)).not.toBe(hashApiKey(keyB, pepper));
  });
});
