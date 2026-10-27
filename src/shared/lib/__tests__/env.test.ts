import { readFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { EXAMPLE_BETTER_AUTH_SECRET, parseEnv } from "@/shared/lib/env";

const validCore = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
  BETTER_AUTH_SECRET: "s".repeat(32),
  APP_URL: "http://localhost:3000",
  EMAIL_FROM: "WA App <noreply@example.com>",
};

describe("parseEnv", () => {
  it("domyślne flagi false", () => {
    const e = parseEnv({ ...validCore });
    expect(e.AUTH_PUBLIC_SIGNUP).toBe(false);
    expect(e.MULTI_ORG).toBe(false);
  });

  it.each(["AUTH_PUBLIC_SIGNUP", "MULTI_ORG"] as const)(
    "%s pusty → false",
    (name) => {
      expect(parseEnv({ ...validCore, [name]: "" })[name]).toBe(false);
    },
  );

  it.each([
    ["AUTH_PUBLIC_SIGNUP", "true"],
    ["AUTH_PUBLIC_SIGNUP", "TRUE"],
    ["AUTH_PUBLIC_SIGNUP", "True"],
    ["AUTH_PUBLIC_SIGNUP", " true "],
    ["MULTI_ORG", "true"],
    ["MULTI_ORG", "TRUE"],
    ["MULTI_ORG", "True"],
    ["MULTI_ORG", " true "],
  ] as const)("%s=%j → true", (name, value) => {
    expect(parseEnv({ ...validCore, [name]: value })[name]).toBe(true);
  });

  it.each([
    ["AUTH_PUBLIC_SIGNUP", "false"],
    ["AUTH_PUBLIC_SIGNUP", "FALSE"],
    ["AUTH_PUBLIC_SIGNUP", " false"],
    ["MULTI_ORG", "false"],
    ["MULTI_ORG", "FALSE"],
    ["MULTI_ORG", " false"],
  ] as const)("%s=%j → false", (name, value) => {
    expect(parseEnv({ ...validCore, [name]: value })[name]).toBe(false);
  });

  it.each([
    ["AUTH_PUBLIC_SIGNUP", "1"],
    ["AUTH_PUBLIC_SIGNUP", "0"],
    ["AUTH_PUBLIC_SIGNUP", "yes"],
    ["AUTH_PUBLIC_SIGNUP", "no"],
    ["AUTH_PUBLIC_SIGNUP", "on"],
    ["AUTH_PUBLIC_SIGNUP", "tru"],
    ["MULTI_ORG", "1"],
    ["MULTI_ORG", "0"],
    ["MULTI_ORG", "yes"],
    ["MULTI_ORG", "no"],
    ["MULTI_ORG", "on"],
    ["MULTI_ORG", "tru"],
  ] as const)("%s=%j → błąd z nazwą zmiennej", (name, value) => {
    expect(() => parseEnv({ ...validCore, [name]: value })).toThrow(
      new RegExp(name),
    );
  });

  it("ADMIN_IMPERSONATION brak → false", () => {
    expect(parseEnv({ ...validCore }).ADMIN_IMPERSONATION).toBe(false);
  });

  it("ADMIN_IMPERSONATION pusty → false", () => {
    expect(
      parseEnv({ ...validCore, ADMIN_IMPERSONATION: "" }).ADMIN_IMPERSONATION,
    ).toBe(false);
  });

  it.each(["true", "TRUE", " true "])(
    "ADMIN_IMPERSONATION=%j → true",
    (value) => {
      expect(
        parseEnv({ ...validCore, ADMIN_IMPERSONATION: value })
          .ADMIN_IMPERSONATION,
      ).toBe(true);
    },
  );

  it.each(["false", "FALSE", " false"])(
    "ADMIN_IMPERSONATION=%j → false",
    (value) => {
      expect(
        parseEnv({ ...validCore, ADMIN_IMPERSONATION: value })
          .ADMIN_IMPERSONATION,
      ).toBe(false);
    },
  );

  it.each(["1", "0", "yes", "on", "tru"])(
    "ADMIN_IMPERSONATION=%j → błąd z nazwą zmiennej",
    (value) => {
      expect(() =>
        parseEnv({ ...validCore, ADMIN_IMPERSONATION: value }),
      ).toThrow(/ADMIN_IMPERSONATION/);
    },
  );

  it("ADMIN_IMPERSONATION nie zmienia AUTH_PUBLIC_SIGNUP ani MULTI_ORG", () => {
    const e = parseEnv({ ...validCore, ADMIN_IMPERSONATION: "true" });
    expect(e.AUTH_PUBLIC_SIGNUP).toBe(false);
    expect(e.MULTI_ORG).toBe(false);
  });

  it.each([
    "http://localhost:3000",
    "https://app.example.com",
    "https://app.example.com/",
  ])("APP_URL %j akceptowany bez zmian", (value) => {
    expect(parseEnv({ ...validCore, APP_URL: value }).APP_URL).toBe(value);
  });

  it.each([
    "localhost:3000",
    "app.example.com",
    "ftp://example.com",
    "/relative",
    "http//x",
    "git+https://example.com",
    "httpx://example.com",
  ])("APP_URL %j → błąd z nazwą zmiennej", (value) => {
    expect(() => parseEnv({ ...validCore, APP_URL: value })).toThrow(/APP_URL/);
  });

  it.each([
    ["32 spacje", " ".repeat(32)],
    ["31 znaków i spacje do 40", "a".repeat(31) + " ".repeat(9)],
  ])(
    "BETTER_AUTH_SECRET %s → błąd z nazwą zmiennej (długość po trim)",
    (_, value) => {
      expect(() =>
        parseEnv({ ...validCore, BETTER_AUTH_SECRET: value }),
      ).toThrow(/BETTER_AUTH_SECRET/);
    },
  );

  it("BETTER_AUTH_SECRET o 32 znakach akceptowany bez zmian", () => {
    expect(
      parseEnv({ ...validCore, BETTER_AUTH_SECRET: "s".repeat(32) })
        .BETTER_AUTH_SECRET,
    ).toBe("s".repeat(32));
  });

  it("BETTER_AUTH_SECRET ze spacjami na brzegach nie jest przycinany", () => {
    expect(
      parseEnv({ ...validCore, BETTER_AUTH_SECRET: ` ${"s".repeat(32)} ` })
        .BETTER_AUTH_SECRET,
    ).toBe(` ${"s".repeat(32)} `);
  });

  it("brak DATABASE_URL → błąd z nazwą zmiennej", () => {
    expect(() => parseEnv({ ...validCore, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("brak APP_URL → błąd z nazwą zmiennej", () => {
    expect(() => parseEnv({ ...validCore, APP_URL: undefined })).toThrow(
      /APP_URL/,
    );
  });

  it("produkcja bez RESEND_API_KEY → błąd z nazwą zmiennej", () => {
    expect(() => parseEnv({ ...validCore, NODE_ENV: "production" })).toThrow(
      /RESEND_API_KEY/,
    );
  });

  it("BETTER_AUTH_SECRET krótszy niż 32 znaki → błąd z nazwą zmiennej", () => {
    expect(() =>
      parseEnv({ ...validCore, BETTER_AUTH_SECRET: "s".repeat(31) }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("opcjonalne zmienne z wartością zachowują ją bez zmian", () => {
    const e = parseEnv({
      ...validCore,
      SMTP_URL: "smtp://localhost:1025",
      ADMIN_EMAIL: "admin@example.com",
      LOG_LEVEL: "debug",
    });
    expect(e.SMTP_URL).toBe("smtp://localhost:1025");
    expect(e.ADMIN_EMAIL).toBe("admin@example.com");
    expect(e.LOG_LEVEL).toBe("debug");
  });

  it("poprawna konfiguracja produkcyjna przechodzi", () => {
    const e = parseEnv({
      ...validCore,
      NODE_ENV: "production",
      RESEND_API_KEY: "re_live",
      BETTER_AUTH_SECRET: "p".repeat(48),
    });
    expect(e.NODE_ENV).toBe("production");
    expect(e.RESEND_API_KEY).toBe("re_live");
    expect(e.BETTER_AUTH_SECRET).toBe("p".repeat(48));
  });

  it("puste opcjonalne zmienne traktuje jak brak", () => {
    const e = parseEnv({
      ...validCore,
      RESEND_API_KEY: "",
      SMTP_URL: "",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: "",
      LOG_LEVEL: "",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
    });
    expect(e.RESEND_API_KEY).toBeUndefined();
    expect(e.SMTP_URL).toBeUndefined();
    expect(e.ADMIN_EMAIL).toBeUndefined();
    expect(e.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
  });

  it("produkcja z pustym RESEND_API_KEY → błąd z nazwą zmiennej", () => {
    expect(() =>
      parseEnv({ ...validCore, NODE_ENV: "production", RESEND_API_KEY: "" }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it("parsuje .env.example skopiowany jako .env", () => {
    const example = dotenv.parse(
      readFileSync(join(process.cwd(), ".env.example"), "utf8"),
    );
    const e = parseEnv(example);
    expect(e.DATABASE_URL).toBe(example.DATABASE_URL);
    expect(e.RESEND_API_KEY).toBeUndefined();
    expect(e.AUTH_PUBLIC_SIGNUP).toBe(false);
  });

  it(".env.example deklaruje ADMIN_IMPERSONATION=false poza regionem modułów", () => {
    const source = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const coreSection = source.split("# wa:modules:start")[0];
    expect(dotenv.parse(coreSection).ADMIN_IMPERSONATION).toBe("false");
    expect(parseEnv(dotenv.parse(source)).ADMIN_IMPERSONATION).toBe(false);
  });

  it("produkcja z BETTER_AUTH_SECRET z .env.example → błąd z nazwą zmiennej", () => {
    expect(() =>
      parseEnv({
        ...validCore,
        NODE_ENV: "production",
        RESEND_API_KEY: "re_live",
        BETTER_AUTH_SECRET: EXAMPLE_BETTER_AUTH_SECRET,
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("placeholder BETTER_AUTH_SECRET dozwolony poza produkcją", () => {
    expect(
      parseEnv({ ...validCore, BETTER_AUTH_SECRET: EXAMPLE_BETTER_AUTH_SECRET })
        .BETTER_AUTH_SECRET,
    ).toBe(EXAMPLE_BETTER_AUTH_SECRET);
  });

  it("stała placeholdera odpowiada wartości w .env.example", () => {
    const example = dotenv.parse(
      readFileSync(join(process.cwd(), ".env.example"), "utf8"),
    );
    expect(example.BETTER_AUTH_SECRET).toBe(EXAMPLE_BETTER_AUTH_SECRET);
  });
});
