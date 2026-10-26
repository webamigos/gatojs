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
});
