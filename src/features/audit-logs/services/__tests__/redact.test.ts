import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { redactSensitive } from "../redact";

const SENSITIVE_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "apikey",
  "authorization",
  "cookie",
  "privatekey",
  "hashedkey",
];

const safeKey = fc.string({ minLength: 1, maxLength: 8 }).filter((key) => {
  const normalized = key.toLowerCase().replaceAll("-", "").replaceAll("_", "");
  return !SENSITIVE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
});

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
  .tuple(
    fc.constantFrom(...SENSITIVE_FRAGMENTS),
    fc.constantFrom("", "new", "x", "my"),
    fc.constantFrom("", "Hint", "s", "Value"),
    fc.constantFrom("", "-", "_"),
    fc.boolean(),
  )
  .map(([fragment, prefix, suffix, separator, upper]) => {
    const key = `${prefix}${separator}${fragment}${separator}${suffix}`;
    return upper ? key.toUpperCase() : key;
  });

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

  it("redaguje klucze zawierające wrażliwy fragment", () => {
    expect(redactSensitive({ passwordHint: "h", tokens: 3 })).toEqual({
      passwordHint: "[REDACTED]",
      tokens: "[REDACTED]",
    });
  });

  it("redaguje warianty z prefiksem, separatorami i inną wielkością liter", () => {
    expect(
      redactSensitive({
        newPassword: "1",
        currentPassword: "2",
        api_key: "3",
        client_secret: "4",
        privateKey: "5",
        "set-cookie": "6",
        "X-API-Key": "7",
      }),
    ).toEqual({
      newPassword: "[REDACTED]",
      currentPassword: "[REDACTED]",
      api_key: "[REDACTED]",
      client_secret: "[REDACTED]",
      privateKey: "[REDACTED]",
      "set-cookie": "[REDACTED]",
      "X-API-Key": "[REDACTED]",
    });
  });

  it("zostawia bezpieczne klucze nietknięte", () => {
    expect(
      redactSensitive({ name: "A", email: "a@a.pl", role: "admin", id: 1 }),
    ).toEqual({ name: "A", email: "a@a.pl", role: "admin", id: 1 });
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

class Money {
  constructor(public cents: number) {}

  toJSON() {
    return "1.50";
  }
}

class Credentials {
  constructor(
    public token: string,
    public amount: number,
  ) {}

  toJSON() {
    return { token: this.token, amount: this.amount };
  }
}

class Account {
  constructor(
    public password: string,
    public name: string,
  ) {}
}

describe("redactSensitive: instancje klas i obiekty bez prototypu", () => {
  it("instancję klasy z toJSON zastępuje wynikiem toJSON", () => {
    const result = redactSensitive({ newData: { amount: new Money(150) } }) as {
      newData: { amount: unknown };
    };

    expect(result.newData.amount).toBe("1.50");
  });

  it("serializacja wyniku używa toJSON instancji klasy", () => {
    const result = redactSensitive({ newData: { amount: new Money(150) } });

    expect(JSON.stringify(result)).toBe('{"newData":{"amount":"1.50"}}');
  });

  it("redaguje klucze w wyniku toJSON instancji klasy", () => {
    const result = redactSensitive({
      newData: { credentials: new Credentials("x", 1) },
    }) as { newData: { credentials: unknown } };

    expect(result.newData.credentials).toEqual({
      token: "[REDACTED]",
      amount: 1,
    });
    expect(result.newData.credentials).not.toBeInstanceOf(Credentials);
  });

  it("instancję klasy bez toJSON zamienia na zwykły obiekt z redakcją", () => {
    const result = redactSensitive({
      newData: { account: new Account("tajne", "Jan") },
    }) as { newData: { account: unknown } };

    expect(result.newData.account).toEqual({
      password: "[REDACTED]",
      name: "Jan",
    });
    expect(result.newData.account).not.toBeInstanceOf(Account);
    expect(JSON.stringify(result)).not.toContain("tajne");
  });

  it("obok instancji klasy nadal redaguje zwykłe obiekty zagnieżdżone", () => {
    const result = redactSensitive({
      newData: {
        amount: new Money(150),
        secret: "s",
        profile: { token: "t", name: "Jan" },
      },
    });

    expect(JSON.stringify(result)).toBe(
      '{"newData":{"amount":"1.50","secret":"[REDACTED]","profile":{"token":"[REDACTED]","name":"Jan"}}}',
    );
  });

  it("redaguje klucz w obiekcie z prototypem null", () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.password = "tajne";
    bare.name = "A";

    const result = redactSensitive({ newData: bare }) as {
      newData: Record<string, unknown>;
    };

    expect(result.newData.password).toBe("[REDACTED]");
    expect(result.newData.name).toBe("A");
    expect(JSON.stringify(result)).not.toContain("tajne");
  });

  it("redaguje obiekt z prototypem null podany na najwyższym poziomie", () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.apiKey = "k-123";

    expect(JSON.stringify(redactSensitive(bare))).toBe(
      '{"apiKey":"[REDACTED]"}',
    );
  });

  it("datę zostawia tą samą referencją", () => {
    const at = new Date("2026-01-02T03:04:05.000Z");

    const result = redactSensitive({ newData: { at } }) as {
      newData: { at: unknown };
    };

    expect(result.newData.at).toBe(at);
  });
});
