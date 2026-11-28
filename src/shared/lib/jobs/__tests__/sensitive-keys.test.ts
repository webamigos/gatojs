import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { isSensitiveKey, SENSITIVE_KEY_PATTERN } from "@/shared/lib/jobs";

const SENSITIVE_WORDS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "session",
];

describe("SENSITIVE_KEY_PATTERN", () => {
  it("ma źródło i flagi ze specyfikacji", () => {
    expect(SENSITIVE_KEY_PATTERN.source).toBe(
      "(password|secret|token|apikey|api_key|authorization|cookie|session)",
    );
    expect(SENSITIVE_KEY_PATTERN.flags).toBe("i");
  });
});

describe("isSensitiveKey", () => {
  it.each([
    "password",
    "PASSWORD",
    "userPassword",
    "clientSecret",
    "apiToken",
    "ApiToken",
    "TOKEN",
    "apikey",
    "ApiKey",
    "api_key",
    "API_KEY",
    "authorization",
    "Authorization",
    "cookie",
    "sessionId",
    "SessionId",
  ])("%s jest wrażliwy", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each([
    "invoiceId",
    "olderThanDays",
    "name",
    "api",
    "key",
    "organizationId",
    "tok",
    "pass",
  ])("%s nie jest wrażliwy", (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });

  it("kolejne wywołania dla tego samego klucza dają ten sam wynik", () => {
    expect(isSensitiveKey("apiToken")).toBe(true);
    expect(isSensitiveKey("apiToken")).toBe(true);
    expect(isSensitiveKey("apiToken")).toBe(true);
  });

  test.prop([
    fc.stringMatching(/^[a-zA-Z0-9]{0,8}$/),
    fc.constantFrom(...SENSITIVE_WORDS),
    fc.array(fc.boolean(), { minLength: 13, maxLength: 13 }),
    fc.stringMatching(/^[a-zA-Z0-9]{0,8}$/),
  ])(
    "klucz zawierający wrażliwe słowo w dowolnej wielkości liter jest wrażliwy",
    (prefix, word, upper, suffix) => {
      const cased = [...word]
        .map((char, index) => (upper[index] ? char.toUpperCase() : char))
        .join("");
      expect(isSensitiveKey(`${prefix}${cased}${suffix}`)).toBe(true);
    },
  );

  test.prop([fc.stringMatching(/^[bfgxyzBFGXYZ0-9_]{0,24}$/)])(
    "klucz z liter, z których nie da się złożyć wrażliwego słowa, nie jest wrażliwy",
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});
