import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createEnv, type CoreEnv } from "../index";

const demoTokenSchema = z
  .object({ DEMO_TOKEN: z.string().min(1) })
  .transform(({ DEMO_TOKEN }) => ({ DEMO_TOKEN }));

type DemoEnv = CoreEnv & { DEMO_TOKEN: string };

const FIRST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/first";
const SECOND_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/second";

function stubValidCore(databaseUrl = FIRST_DATABASE_URL) {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", databaseUrl);
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("EMAIL_FROM", "WA App <noreply@example.com>");
  vi.stubEnv("MULTI_ORG", "true");
  vi.stubEnv("RESEND_API_KEY", undefined);
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", undefined);
}

describe("createEnv", () => {
  beforeEach(() => {
    stubValidCore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creating the object with an invalid process.env does not throw", () => {
    vi.stubEnv("DATABASE_URL", undefined);

    expect(() => createEnv([])).not.toThrow();
  });

  it("creating the object does not parse yet: a fix made before the first read is seen", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const env = createEnv([]);

    vi.stubEnv("DATABASE_URL", SECOND_DATABASE_URL);

    expect(env.DATABASE_URL).toBe(SECOND_DATABASE_URL);
  });

  it("creating the object does not read a value yet: a change made before the first read is seen", () => {
    const env = createEnv([]);

    vi.stubEnv("DATABASE_URL", SECOND_DATABASE_URL);

    expect(env.DATABASE_URL).toBe(SECOND_DATABASE_URL);
  });

  it("the first property read of an invalid process.env throws parseEnv's error", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const env = createEnv([]);

    expect(() => env.DATABASE_URL).toThrow(
      /^Nieprawidłowe zmienne środowiskowe: DATABASE_URL: /,
    );
  });

  it("reads parsed core values, flags as booleans", () => {
    const env = createEnv([]);

    expect(env.DATABASE_URL).toBe(FIRST_DATABASE_URL);
    expect(env.MULTI_ORG).toBe(true);
    expect(env.AUTH_PUBLIC_SIGNUP).toBe(false);
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("caches the parsed result: a later process.env change is not seen by the same object", () => {
    const env = createEnv([]);
    expect(env.DATABASE_URL).toBe(FIRST_DATABASE_URL);

    vi.stubEnv("DATABASE_URL", SECOND_DATABASE_URL);
    vi.stubEnv("MULTI_ORG", "false");

    expect(env.DATABASE_URL).toBe(FIRST_DATABASE_URL);
    expect(env.MULTI_ORG).toBe(true);
  });

  it("caches the parsed result: breaking process.env after the first read does not throw", () => {
    const env = createEnv([]);
    expect(env.MULTI_ORG).toBe(true);

    vi.stubEnv("DATABASE_URL", undefined);

    expect(env.DATABASE_URL).toBe(FIRST_DATABASE_URL);
  });

  it("each createEnv call has its own cache", () => {
    const first = createEnv([]);
    expect(first.DATABASE_URL).toBe(FIRST_DATABASE_URL);

    vi.stubEnv("DATABASE_URL", SECOND_DATABASE_URL);
    const second = createEnv([]);

    expect(second.DATABASE_URL).toBe(SECOND_DATABASE_URL);
    expect(first.DATABASE_URL).toBe(FIRST_DATABASE_URL);
  });

  it("exposes the output keys of a module schema", () => {
    vi.stubEnv("DEMO_TOKEN", "t");
    const env = createEnv([demoTokenSchema]) as DemoEnv;

    expect(env.DEMO_TOKEN).toBe("t");
    expect(env.DATABASE_URL).toBe(FIRST_DATABASE_URL);
  });

  it("validates the module schemas it was given: a missing module variable throws on first read", () => {
    vi.stubEnv("DEMO_TOKEN", undefined);
    const env = createEnv([demoTokenSchema]);

    expect(() => env.DATABASE_URL).toThrow(
      /^Nieprawidłowe zmienne środowiskowe: DEMO_TOKEN: /,
    );
  });

  it("without module schemas a module variable is not required", () => {
    vi.stubEnv("DEMO_TOKEN", undefined);

    expect(createEnv([]).DATABASE_URL).toBe(FIRST_DATABASE_URL);
  });

  it("reports every issue of the first read at once", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DEMO_TOKEN", "");
    const env = createEnv([demoTokenSchema]);

    expect(() => env.MULTI_ORG).toThrow(
      /^Nieprawidłowe zmienne środowiskowe: (DATABASE_URL: .+; DEMO_TOKEN: .+|DEMO_TOKEN: .+; DATABASE_URL: .+)$/,
    );
  });
});
