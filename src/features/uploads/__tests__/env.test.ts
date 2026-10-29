import { describe, expect, it } from "vitest";
import { envSchema } from "../env";

const VALID = {
  S3_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "test-bucket",
};

describe("envSchema uploads", () => {
  it("przyjmuje komplet wartości przykładowych MinIO", () => {
    expect(
      envSchema.parse({
        ...VALID,
        S3_REGION: "auto",
        S3_FORCE_PATH_STYLE: "true",
      }),
    ).toStrictEqual({
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "auto",
      S3_ACCESS_KEY_ID: "minioadmin",
      S3_SECRET_ACCESS_KEY: "minioadmin",
      S3_BUCKET: "test-bucket",
      S3_FORCE_PATH_STYLE: true,
    });
  });

  it("odrzuca brak S3_BUCKET", () => {
    const { S3_BUCKET: _omitted, ...withoutBucket } = VALID;
    const result = envSchema.safeParse(withoutBucket);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["S3_BUCKET"]);
  });

  it.each(["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const)(
    "odrzuca brak %s",
    (field) => {
      const input: Record<string, string> = { ...VALID };
      delete input[field];
      const result = envSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([field]);
    },
  );

  it("odrzuca S3_ENDPOINT, który nie jest adresem url", () => {
    const result = envSchema.safeParse({ ...VALID, S3_ENDPOINT: "nie-url" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["S3_ENDPOINT"]);
  });

  it("odrzuca pusty S3_BUCKET", () => {
    expect(envSchema.safeParse({ ...VALID, S3_BUCKET: "" }).success).toBe(
      false,
    );
  });

  it("S3_REGION domyślnie wynosi auto", () => {
    expect(envSchema.parse(VALID).S3_REGION).toBe("auto");
  });

  it("zachowuje podany S3_REGION", () => {
    expect(
      envSchema.parse({ ...VALID, S3_REGION: "eu-central-1" }).S3_REGION,
    ).toBe("eu-central-1");
  });

  it("S3_FORCE_PATH_STYLE=true daje true", () => {
    expect(
      envSchema.parse({ ...VALID, S3_FORCE_PATH_STYLE: "true" })
        .S3_FORCE_PATH_STYLE,
    ).toBe(true);
  });

  it("S3_FORCE_PATH_STYLE=false daje false", () => {
    expect(
      envSchema.parse({ ...VALID, S3_FORCE_PATH_STYLE: "false" })
        .S3_FORCE_PATH_STYLE,
    ).toBe(false);
  });

  it("brak S3_FORCE_PATH_STYLE daje false", () => {
    expect(envSchema.parse(VALID).S3_FORCE_PATH_STYLE).toBe(false);
  });

  it("odrzuca S3_FORCE_PATH_STYLE spoza true/false", () => {
    const result = envSchema.safeParse({
      ...VALID,
      S3_FORCE_PATH_STYLE: "tak",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["S3_FORCE_PATH_STYLE"]);
  });

  it("zwraca tylko pola S3, bez cudzych kluczy", () => {
    const parsed = envSchema.parse({
      ...VALID,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_FORCE_PATH_STYLE",
      "S3_REGION",
      "S3_SECRET_ACCESS_KEY",
    ]);
  });
});
