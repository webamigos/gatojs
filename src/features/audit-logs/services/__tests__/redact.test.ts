import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { redactSensitive } from "../redact";

const SENSITIVE_KEYS = [
  "password",
  "passwordhash",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "hashedkey",
  "authorization",
  "cookie",
];

const safeKey = fc
  .string({ minLength: 1, maxLength: 8 })
  .filter((key) => !SENSITIVE_KEYS.includes(key.toLowerCase()));

const safeJson = fc.letrec((tie) => ({
  node: fc.oneof(
    { maxDepth: 3 },
    fc.string({ maxLength: 8 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(tie("node"), { maxLength: 3 }),
    fc.dictionary(safeKey, tie("node"), { maxKeys: 3 }),
  ),
})).node;

const sensitiveKeyVariant = fc
  .constantFrom(...SENSITIVE_KEYS)
  .chain((key) =>
    fc
      .array(fc.boolean(), { minLength: key.length, maxLength: key.length })
      .map((flags) =>
        [...key]
          .map((char, index) => (flags[index] ? char.toUpperCase() : char))
          .join(""),
      ),
  );

describe("redactSensitive", () => {
  it("zastępuje wartość klucza password", () => {
    expect(redactSensitive({ name: "A", password: "x" })).toEqual({
      name: "A",
      password: "[REDACTED]",
    });
  });

  it("redaguje klucz w obiekcie wewnątrz tablicy bez względu na wielkość liter", () => {
    expect(
      redactSensitive({ users: [{ Authorization: "Bearer y", id: 1 }] }),
    ).toEqual({ users: [{ Authorization: "[REDACTED]", id: 1 }] });
  });

  it("redaguje tablicę w tablicy", () => {
    expect(
      redactSensitive([[{ TOKEN: "t" }], { a: [{ apiKey: "k" }] }]),
    ).toEqual([[{ TOKEN: "[REDACTED]" }], { a: [{ apiKey: "[REDACTED]" }] }]);
  });

  it("redaguje wszystkie wrażliwe klucze z listy", () => {
    expect(
      redactSensitive({
        password: "1",
        passwordHash: "2",
        secret: "3",
        token: "4",
        accessToken: "5",
        refreshToken: "6",
        apiKey: "7",
        hashedKey: "8",
        authorization: "9",
        cookie: "10",
        keep: "ok",
      }),
    ).toEqual({
      password: "[REDACTED]",
      passwordHash: "[REDACTED]",
      secret: "[REDACTED]",
      token: "[REDACTED]",
      accessToken: "[REDACTED]",
      refreshToken: "[REDACTED]",
      apiKey: "[REDACTED]",
      hashedKey: "[REDACTED]",
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      keep: "ok",
    });
  });

  it("redaguje wrażliwy klucz, którego wartością jest obiekt", () => {
    expect(redactSensitive({ secret: { nested: "x" }, id: 2 })).toEqual({
      secret: "[REDACTED]",
      id: 2,
    });
  });

  it("nie redaguje kluczy, które tylko zawierają wrażliwą nazwę", () => {
    expect(redactSensitive({ passwordHint: "h", tokens: 3 })).toEqual({
      passwordHint: "h",
      tokens: 3,
    });
  });

  it("zwraca tekst bez zmian", () => {
    expect(redactSensitive("text")).toBe("text");
  });

  it("zwraca null bez zmian", () => {
    expect(redactSensitive(null)).toBeNull();
  });

  it("zwraca undefined bez zmian", () => {
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  it("zostawia datę datą", () => {
    const date = new Date("2026-01-02T03:04:05.000Z");

    const result = redactSensitive({ at: date }) as { at: unknown };

    expect(result.at).toBeInstanceOf(Date);
    expect((result.at as Date).toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });

  it("nie mutuje wejścia", () => {
    const input = { password: "x", list: [{ token: "y" }] };

    redactSensitive(input);

    expect(input).toEqual({ password: "x", list: [{ token: "y" }] });
  });

  test.prop([safeJson])(
    "JSON bez kluczy wrażliwych wychodzi bez zmian",
    (value) => {
      expect(redactSensitive(value)).toEqual(value);
    },
  );

  test.prop([
    safeJson,
    sensitiveKeyVariant,
    fc.uuid(),
    fc.array(fc.constantFrom("object", "array"), { maxLength: 4 }),
  ])(
    "wartość spod klucza wrażliwego nie przeżywa na żadnej głębokości",
    (filler, key, sentinel, wrappers) => {
      const leaf = { keep: filler, [key]: `sentinel-${sentinel}` };
      const wrapped = wrappers.reduce<unknown>(
        (inner, wrapper) => (wrapper === "array" ? [inner] : { inner }),
        leaf,
      );

      const serialized = JSON.stringify(redactSensitive(wrapped));

      expect(serialized).not.toContain(sentinel);
      expect(serialized).toContain("[REDACTED]");
    },
  );
});
