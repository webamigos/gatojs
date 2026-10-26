import { readFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/shared/lib/env";

const validCore = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_FROM: "WA App <noreply@example.com>",
};

describe("parseEnv", () => {
  it("domyślne flagi false", () => {
    const e = parseEnv({ ...validCore });
    expect(e.AUTH_PUBLIC_SIGNUP).toBe(false);
    expect(e.MULTI_ORG).toBe(false);
  });

  it("flagi true tylko dla napisu true", () => {
    const e = parseEnv({
      ...validCore,
      AUTH_PUBLIC_SIGNUP: "true",
      MULTI_ORG: "1",
    });
    expect(e.AUTH_PUBLIC_SIGNUP).toBe(true);
    expect(e.MULTI_ORG).toBe(false);
  });

  it("brak DATABASE_URL → błąd z nazwą zmiennej", () => {
    expect(() => parseEnv({ ...validCore, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
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
});
