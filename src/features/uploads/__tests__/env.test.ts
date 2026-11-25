// @vitest-environment node
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { z } from "zod";
import { envSchema } from "../env";

const S3_MINIO = {
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "test-bucket",
  S3_FORCE_PATH_STYLE: "true",
};

const S3_MINIO_ENV = {
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "auto",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "test-bucket",
  S3_FORCE_PATH_STYLE: true,
};

const RAILWAY_WITHOUT_VOLUME =
  "on Railway without a volume, files are lost on redeploy: attach a volume or set STORAGE_PROVIDER=s3";

const anyText = fc.option(fc.string(), { nil: undefined });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("envSchema uploads: provider local", () => {
  it("bez zmiennych wybiera local z katalogiem volumes/uploads w katalogu roboczym procesu", () => {
    const result = envSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: `${process.cwd()}/volumes/uploads`,
    });
  });

  it("domyślny katalog liczy od katalogu roboczego z chwili parsowania, a nie od stałej", () => {
    vi.spyOn(process, "cwd").mockReturnValue("/srv/aplikacja");

    expect(envSchema.parse({})).toStrictEqual({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: "/srv/aplikacja/volumes/uploads",
    });
  });

  it("puste zmienne storage znaczą nieustawione", () => {
    expect(
      envSchema.parse({
        STORAGE_PROVIDER: "",
        STORAGE_LOCAL_PATH: "",
        RAILWAY_ENVIRONMENT_ID: "",
        RAILWAY_VOLUME_MOUNT_PATH: "",
      }),
    ).toStrictEqual({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: `${process.cwd()}/volumes/uploads`,
    });
  });

  it("przy local nie sprawdza zmiennych S3_*", () => {
    expect(
      envSchema.parse({
        S3_ENDPOINT: "nie-url",
        S3_BUCKET: "",
        S3_FORCE_PATH_STYLE: "tak",
      }),
    ).toStrictEqual({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: `${process.cwd()}/volumes/uploads`,
    });
  });

  test.prop([
    fc.constantFrom(undefined, "", "local", " LOCAL "),
    fc.constantFrom("/srv/pliki", "/data/uploads", "/tmp/wa-uploads"),
    fc.record(
      {
        NODE_ENV: fc.option(
          fc.string().filter((value) => value !== "production"),
          { nil: undefined },
        ),
        RAILWAY_ENVIRONMENT_ID: anyText,
        RAILWAY_VOLUME_MOUNT_PATH: anyText,
        S3_ENDPOINT: anyText,
        S3_REGION: anyText,
        S3_ACCESS_KEY_ID: anyText,
        S3_SECRET_ACCESS_KEY: anyText,
        S3_BUCKET: anyText,
        S3_FORCE_PATH_STYLE: anyText,
        DATABASE_URL: anyText,
      },
      { requiredKeys: [] },
    ),
  ])(
    "local poza produkcją zwraca jawny katalog i tylko dwa klucze, cokolwiek jest w pozostałych zmiennych",
    (provider, localPath, rest) => {
      expect(
        envSchema.parse({
          ...rest,
          STORAGE_PROVIDER: provider,
          STORAGE_LOCAL_PATH: localPath,
        }),
      ).toStrictEqual({
        STORAGE_PROVIDER: "local",
        STORAGE_LOCAL_PATH: localPath,
      });
    },
  );

  it("nieznany provider daje jeden problem STORAGE_PROVIDER, bez sprawdzania S3_*", () => {
    const result = envSchema.safeParse({
      STORAGE_PROVIDER: "ftp",
      S3_ENDPOINT: "nie-url",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["STORAGE_PROVIDER"],
        message: "allowed values: local, s3",
      },
    ]);
  });

  it("wartość, która nie jest napisem, odrzuca jako problem tej zmiennej", () => {
    const result = envSchema.safeParse({ STORAGE_PROVIDER: 3 });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "invalid_type", path: ["STORAGE_PROVIDER"] },
    ]);
  });
});

describe("envSchema uploads: provider s3", () => {
  it("s3 z kompletem wartości MinIO zwraca konfigurację S3 z regionem auto i flagą jako boolean", () => {
    expect(envSchema.parse(S3_MINIO)).toStrictEqual(S3_MINIO_ENV);
  });

  it("s3 zachowuje podany S3_REGION", () => {
    expect(
      envSchema.parse({ ...S3_MINIO, S3_REGION: "eu-central-1" }),
    ).toStrictEqual({ ...S3_MINIO_ENV, S3_REGION: "eu-central-1" });
  });

  it("s3 bez S3_BUCKET zgłasza jeden problem pod nazwą S3_BUCKET", () => {
    const result = envSchema.safeParse({
      STORAGE_PROVIDER: "s3",
      S3_ENDPOINT: "http://localhost:9000",
      S3_ACCESS_KEY_ID: "minioadmin",
      S3_SECRET_ACCESS_KEY: "minioadmin",
      S3_FORCE_PATH_STYLE: "true",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["S3_BUCKET"],
        message: expect.stringMatching(/\S/),
      },
    ]);
  });

  it("s3 with a scheme-less S3_ENDPOINT reports one issue under S3_ENDPOINT", () => {
    const result = envSchema.safeParse({
      ...S3_MINIO,
      S3_ENDPOINT: "localhost:9000",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      { code: "custom", path: ["S3_ENDPOINT"], message: "Invalid URL" },
    ]);
  });

  it("s3 bez zmiennych S3_* zgłasza osobny problem dla każdej wymaganej", () => {
    const result = envSchema.safeParse({ STORAGE_PROVIDER: "s3" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path).sort()).toEqual([
      ["S3_ACCESS_KEY_ID"],
      ["S3_BUCKET"],
      ["S3_ENDPOINT"],
      ["S3_SECRET_ACCESS_KEY"],
    ]);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual([
      "custom",
      "custom",
      "custom",
      "custom",
    ]);
  });

  test.prop([
    fc.record(
      {
        NODE_ENV: fc.option(
          fc.oneof(
            fc.constantFrom("production", "development", "test"),
            fc.string(),
          ),
          { nil: undefined },
        ),
        RAILWAY_ENVIRONMENT_ID: anyText,
        RAILWAY_VOLUME_MOUNT_PATH: anyText,
        STORAGE_LOCAL_PATH: anyText,
        DATABASE_URL: anyText,
        APP_URL: anyText,
      },
      { requiredKeys: [] },
    ),
  ])(
    "s3 z poprawną konfiguracją zwraca tę samą konfigurację S3, cokolwiek jest w NODE_ENV, RAILWAY_*, STORAGE_LOCAL_PATH i cudzych zmiennych",
    (rest) => {
      expect(envSchema.parse({ ...rest, ...S3_MINIO })).toStrictEqual(
        S3_MINIO_ENV,
      );
    },
  );
});

describe("envSchema uploads: S3_SESSION_TOKEN", () => {
  it("passes a set session token through to the parsed s3 config", () => {
    expect(
      envSchema.parse({ ...S3_MINIO, S3_SESSION_TOKEN: "tok" }),
    ).toStrictEqual({ ...S3_MINIO_ENV, S3_SESSION_TOKEN: "tok" });
  });

  it.each(["", "   "])(
    "treats a blank session token (%j) as unset",
    (token) => {
      expect(envSchema.parse({ ...S3_MINIO, S3_SESSION_TOKEN: token })).toEqual(
        S3_MINIO_ENV,
      );
    },
  );

  it("rejects a session token that is not a string as an issue of that variable", () => {
    const result = envSchema.safeParse({ ...S3_MINIO, S3_SESSION_TOKEN: 3 });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { code: "invalid_type", path: ["S3_SESSION_TOKEN"] },
    ]);
  });

  it("ignores a session token when the provider is local", () => {
    expect(envSchema.parse({ S3_SESSION_TOKEN: "tok" })).toStrictEqual({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: `${process.cwd()}/volumes/uploads`,
    });
  });
});

describe("envSchema uploads: reguły produkcyjne", () => {
  it("produkcja na Railway bez wolumenu daje jeden problem STORAGE_PROVIDER z komunikatem o redeployu", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      RAILWAY_ENVIRONMENT_ID: "e1",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: "custom",
        path: ["STORAGE_PROVIDER"],
        message: RAILWAY_WITHOUT_VOLUME,
      },
    ]);
  });
});

describe("envSchema uploads: kształt wyniku", () => {
  it("wynik s3 ma tylko klucze konfiguracji S3, bez NODE_ENV, RAILWAY_* i cudzych zmiennych", () => {
    const parsed = envSchema.parse({
      ...S3_MINIO,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      RAILWAY_ENVIRONMENT_ID: "e1",
    });

    expect(Object.keys(parsed).sort()).toEqual([
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_FORCE_PATH_STYLE",
      "S3_REGION",
      "S3_SECRET_ACCESS_KEY",
      "STORAGE_PROVIDER",
    ]);
  });

  it("wynik local na Railway z wolumenem ma tylko STORAGE_PROVIDER i STORAGE_LOCAL_PATH z katalogiem wolumenu", () => {
    const parsed = envSchema.parse({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      RAILWAY_ENVIRONMENT_ID: "e1",
      RAILWAY_VOLUME_MOUNT_PATH: "/data",
    });

    expect(parsed).toStrictEqual({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: "/data",
    });
  });

  it("przecięcie ze schematem z domyślnym NODE_ENV daje jedno NODE_ENV i konfigurację local", () => {
    const withNodeEnv = z.intersection(
      z.object({
        NODE_ENV: z
          .enum(["development", "test", "production"])
          .default("development"),
      }),
      envSchema,
    );

    expect(withNodeEnv.parse({})).toStrictEqual({
      NODE_ENV: "development",
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: `${process.cwd()}/volumes/uploads`,
    });
  });
});

describe("envSchema uploads: zgodność z rejestrem env rdzenia", () => {
  it("wynik envSchema jest przypisywalny do Record<string, unknown>, czego rdzeń wymaga od schematu env modułu", () => {
    expectTypeOf<z.output<typeof envSchema>>().toExtend<
      Record<string, unknown>
    >();
  });

  it("rejestr z samym envSchema przechodzi rzutowanie z @gatojs/env i parsuje pusty env do local", () => {
    const moduleEnvSchemas = [envSchema];
    const moduleSchemas = moduleEnvSchemas as readonly z.ZodType<
      Record<string, unknown>
    >[];

    expect(moduleSchemas[0]?.parse({})).toStrictEqual({
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_PATH: `${process.cwd()}/volumes/uploads`,
    });
  });
});
