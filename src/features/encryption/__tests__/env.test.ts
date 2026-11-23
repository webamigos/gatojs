import { checkEnv, formatEnvReport } from "@gatojs/env";
import { describe, expect, it } from "vitest";
import { envSchema, EXAMPLE_ENCRYPTION_MASTER_KEY } from "../env";

const OWN_KEY =
  "c0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedf";
const OWN_KEY_BASE64 = "wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t8=";
const REQUIRED_MESSAGE =
  'ENCRYPTION_MASTER_KEY is required when ENCRYPTION_PROVIDER is "local"';
const EXAMPLE_IN_PRODUCTION_MESSAGE =
  "must not be the .env.example value in production";

const validCore = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa",
  BETTER_AUTH_SECRET: "s".repeat(32),
  APP_URL: "http://localhost:3000",
  EMAIL_FROM: "WA App <noreply@example.com>",
};

function parse(input: {
  ENCRYPTION_PROVIDER?: string;
  ENCRYPTION_MASTER_KEY?: string;
  NODE_ENV?: string;
}) {
  return envSchema.safeParse({ NODE_ENV: "development", ...input });
}

function issuesOf(result: ReturnType<typeof parse>) {
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map(({ path, message }) => ({
    path,
    message,
  }));
}

describe("envSchema encryption", () => {
  it("keeps the .env.example value documented in the contract", () => {
    expect(EXAMPLE_ENCRYPTION_MASTER_KEY).toBe(
      "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
    );
  });

  it("defaults the provider to local when it is unset", () => {
    expect(envSchema.parse({ ENCRYPTION_MASTER_KEY: OWN_KEY })).toStrictEqual({
      ENCRYPTION_PROVIDER: "local",
      ENCRYPTION_MASTER_KEY: OWN_KEY,
    });
  });

  it.each(["", "   "])("treats a blank provider (%j) as local", (provider) => {
    expect(
      parse({ ENCRYPTION_PROVIDER: provider, ENCRYPTION_MASTER_KEY: OWN_KEY }),
    ).toStrictEqual({
      success: true,
      data: { ENCRYPTION_PROVIDER: "local", ENCRYPTION_MASTER_KEY: OWN_KEY },
    });
  });

  it("accepts the local provider spelled out", () => {
    expect(
      parse({ ENCRYPTION_PROVIDER: "local", ENCRYPTION_MASTER_KEY: OWN_KEY })
        .data,
    ).toStrictEqual({
      ENCRYPTION_PROVIDER: "local",
      ENCRYPTION_MASTER_KEY: OWN_KEY,
    });
  });

  it("rejects a provider other than local on ENCRYPTION_PROVIDER", () => {
    const issues = issuesOf(
      parse({ ENCRYPTION_PROVIDER: "aws-kms", ENCRYPTION_MASTER_KEY: OWN_KEY }),
    );

    expect(issues.map(({ path }) => path)).toContainEqual([
      "ENCRYPTION_PROVIDER",
    ]);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])(
    "requires the master key for the local provider when it is %s",
    (_label, key) => {
      expect(
        issuesOf(
          parse({ ENCRYPTION_PROVIDER: "local", ENCRYPTION_MASTER_KEY: key }),
        ),
      ).toEqual([
        { path: ["ENCRYPTION_MASTER_KEY"], message: REQUIRED_MESSAGE },
      ]);
    },
  );

  it("requires the master key when the provider defaults to local", () => {
    expect(issuesOf(parse({}))).toEqual([
      { path: ["ENCRYPTION_MASTER_KEY"], message: REQUIRED_MESSAGE },
    ]);
  });

  it.each([
    ["too short", "too-short"],
    ["32 hex characters", "ab".repeat(16)],
    ["base64 of 48 bytes", Buffer.alloc(48, 9).toString("base64")],
  ])(
    "rejects a master key that is %s on ENCRYPTION_MASTER_KEY",
    (_label, key) => {
      const issues = issuesOf(parse({ ENCRYPTION_MASTER_KEY: key }));

      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(["ENCRYPTION_MASTER_KEY"]);
      expect(issues[0]?.message).toContain("64-character hex");
    },
  );

  it("accepts a base64 master key", () => {
    expect(parse({ ENCRYPTION_MASTER_KEY: OWN_KEY_BASE64 }).data).toStrictEqual(
      {
        ENCRYPTION_PROVIDER: "local",
        ENCRYPTION_MASTER_KEY: OWN_KEY_BASE64,
      },
    );
  });

  it("returns the master key trimmed", () => {
    expect(
      parse({ ENCRYPTION_MASTER_KEY: `  ${OWN_KEY}\n` }).data,
    ).toStrictEqual({
      ENCRYPTION_PROVIDER: "local",
      ENCRYPTION_MASTER_KEY: OWN_KEY,
    });
  });

  it("rejects the .env.example value in production", () => {
    expect(
      issuesOf(
        parse({
          ENCRYPTION_MASTER_KEY: EXAMPLE_ENCRYPTION_MASTER_KEY,
          NODE_ENV: "production",
        }),
      ),
    ).toEqual([
      {
        path: ["ENCRYPTION_MASTER_KEY"],
        message: EXAMPLE_IN_PRODUCTION_MESSAGE,
      },
    ]);
  });

  it("rejects the .env.example value with surrounding whitespace in production", () => {
    const issues = issuesOf(
      parse({
        ENCRYPTION_MASTER_KEY: ` ${EXAMPLE_ENCRYPTION_MASTER_KEY}\n`,
        NODE_ENV: "production",
      }),
    );

    expect(issues).toEqual([
      {
        path: ["ENCRYPTION_MASTER_KEY"],
        message: EXAMPLE_IN_PRODUCTION_MESSAGE,
      },
    ]);
  });

  it("accepts an own master key in production", () => {
    expect(
      parse({ ENCRYPTION_MASTER_KEY: OWN_KEY, NODE_ENV: "production" }).data,
    ).toStrictEqual({
      ENCRYPTION_PROVIDER: "local",
      ENCRYPTION_MASTER_KEY: OWN_KEY,
    });
  });

  it.each(["development", "test"])(
    "accepts the .env.example value outside production (%s)",
    (nodeEnv) => {
      expect(
        parse({
          ENCRYPTION_MASTER_KEY: EXAMPLE_ENCRYPTION_MASTER_KEY,
          NODE_ENV: nodeEnv,
        }).data,
      ).toStrictEqual({
        ENCRYPTION_PROVIDER: "local",
        ENCRYPTION_MASTER_KEY: EXAMPLE_ENCRYPTION_MASTER_KEY,
      });
    },
  );

  it("returns only the provider and the key, without NODE_ENV", () => {
    expect(
      envSchema.parse({
        ENCRYPTION_PROVIDER: "local",
        ENCRYPTION_MASTER_KEY: OWN_KEY,
        NODE_ENV: "production",
      }),
    ).toStrictEqual({
      ENCRYPTION_PROVIDER: "local",
      ENCRYPTION_MASTER_KEY: OWN_KEY,
    });
  });
});

describe("startup report with the encryption module", () => {
  it("names ENCRYPTION_MASTER_KEY when it is missing for the local provider", () => {
    const result = checkEnv({ ...validCore, ENCRYPTION_PROVIDER: "local" }, [
      envSchema,
    ]);

    expect(result).toEqual({
      ok: false,
      issues: [{ name: "ENCRYPTION_MASTER_KEY", message: REQUIRED_MESSAGE }],
    });
    expect(result.ok === false && formatEnvReport(result.issues)).toContain(
      "ENCRYPTION_MASTER_KEY",
    );
  });

  it("names ENCRYPTION_MASTER_KEY when neither variable is set", () => {
    const result = checkEnv(validCore, [envSchema]);

    expect(result).toEqual({
      ok: false,
      issues: [{ name: "ENCRYPTION_MASTER_KEY", message: REQUIRED_MESSAGE }],
    });
  });

  it("passes with a valid master key", () => {
    expect(
      checkEnv({ ...validCore, ENCRYPTION_MASTER_KEY: OWN_KEY }, [envSchema]),
    ).toMatchObject({ ok: true });
  });
});
