// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { StorageEnv } from "../../contracts/storage.types";
import {
  DEFAULT_LOCAL_STORAGE_PATH,
  resolveStorageEnv,
  type StorageEnvIssue,
  type StorageEnvResult,
} from "../storage-env";

type Source = Readonly<Record<string, string | undefined>>;

const CWD = "/app";

const S3_OK = {
  S3_ENDPOINT: "https://t3.storageapi.dev",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
  S3_BUCKET: "b",
};

const S3_OK_ENV = {
  STORAGE_PROVIDER: "s3",
  ...S3_OK,
  S3_REGION: "auto",
  S3_FORCE_PATH_STYLE: false,
};

const PRODUCTION_ON_RAILWAY = {
  NODE_ENV: "production",
  RAILWAY_ENVIRONMENT_ID: "e1",
};

const UNKNOWN_PROVIDER = {
  name: "STORAGE_PROVIDER",
  message: "allowed values: local, s3",
};

const RAILWAY_WITHOUT_VOLUME = {
  name: "STORAGE_PROVIDER",
  message:
    "on Railway without a volume, files are lost on redeploy: attach a volume or set STORAGE_PROVIDER=s3",
};

const OUTSIDE_DATA_VOLUME = {
  name: "STORAGE_LOCAL_PATH",
  message: "must be inside the Railway volume (/data)",
};

const PATH_REQUIRED = {
  name: "STORAGE_LOCAL_PATH",
  message:
    "required in production with STORAGE_PROVIDER=local: point it at a persistent directory",
};

const PATH_NOT_ABSOLUTE = {
  name: "STORAGE_LOCAL_PATH",
  message:
    "must be an absolute path in production outside Railway: point it at a persistent directory",
};

const ANY_ZOD_MESSAGE = expect.stringMatching(/\S/);

const whitespace = fc.string({
  unit: fc.constantFrom(" ", "\t", "\n", "\r"),
  maxLength: 3,
});

const blankOrMissing = fc.option(whitespace, { nil: undefined });

const anyText = fc.option(fc.string(), { nil: undefined });

function spelledAnyWay(word: string) {
  return fc
    .tuple(whitespace, fc.mixedCase(fc.constant(word)), whitespace)
    .map(([before, core, after]) => `${before}${core}${after}`);
}

const localProvider = fc.oneof(blankOrMissing, spelledAnyWay("local"));

const unknownProvider = fc.oneof(
  fc.constantFrom(
    "ftp",
    "gcs",
    "lokal",
    "locals",
    "local3",
    "s4",
    "s3s",
    "s 3",
    "local,s3",
  ),
  fc
    .tuple(whitespace, fc.string(), whitespace)
    .map(([before, rest, after]) => `${before}x${rest}${after}`),
);

const railwayEnvironmentId = fc
  .tuple(whitespace, fc.uuid(), whitespace)
  .map(([before, id, after]) => `${before}${id}${after}`);

const notProduction = fc.option(
  fc
    .oneof(fc.constantFrom("development", "test"), fc.string())
    .filter((value) => value !== "production"),
  { nil: undefined },
);

const relativeLocalPath = fc
  .tuple(
    whitespace,
    fc.oneof(
      fc.constantFrom(
        "./x",
        "./volumes/uploads",
        "data/u",
        "../uploads",
        ".",
        "~/uploads",
      ),
      fc.stringMatching(/^[a-z0-9._~-]+(\/[a-z0-9._~-]+)*$/),
    ),
    whitespace,
  )
  .map(([before, core, after]) => `${before}${core}${after}`);

function envOf(result: StorageEnvResult): StorageEnv {
  if (!result.ok) {
    throw new Error(
      `oczekiwano env, są problemy: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.env;
}

function issueNamesOf(result: StorageEnvResult): string[] {
  if (result.ok) {
    throw new Error(
      `oczekiwano problemów, jest env: ${JSON.stringify(result.env)}`,
    );
  }
  return result.issues.map((issue) => issue.name).sort();
}

describe("resolveStorageEnv: wybór providera", () => {
  it("domyślny katalog local to ./volumes/uploads", () => {
    expect(DEFAULT_LOCAL_STORAGE_PATH).toBe("./volumes/uploads");
  });

  it.each<[string, Source]>([
    [
      "bez STORAGE_PROVIDER wybiera local z katalogiem volumes/uploads w cwd",
      {},
    ],
    [
      "pusty STORAGE_PROVIDER znaczy nieustawiony, więc wybiera local",
      { STORAGE_PROVIDER: "" },
    ],
    [
      "STORAGE_PROVIDER z samych spacji znaczy nieustawiony, więc wybiera local",
      { STORAGE_PROVIDER: "  " },
    ],
    [
      "STORAGE_PROVIDER „ LOCAL ” po trim() i zamianie na małe litery to local",
      { STORAGE_PROVIDER: " LOCAL " },
    ],
  ])("%s", (_scenario, source) => {
    expect(resolveStorageEnv(source, CWD)).toEqual({
      ok: true,
      env: {
        STORAGE_PROVIDER: "local",
        STORAGE_LOCAL_PATH: "/app/volumes/uploads",
      },
    });
  });

  it("nieznany STORAGE_PROVIDER daje jeden problem z listą dozwolonych wartości", () => {
    expect(resolveStorageEnv({ STORAGE_PROVIDER: "ftp" }, CWD)).toEqual({
      ok: false,
      issues: [UNKNOWN_PROVIDER],
    });
  });

  it("nieznany STORAGE_PROVIDER w produkcji nie dokłada problemów z reguł local", () => {
    expect(
      resolveStorageEnv(
        { STORAGE_PROVIDER: "ftp", NODE_ENV: "production" },
        CWD,
      ),
    ).toEqual({ ok: false, issues: [UNKNOWN_PROVIDER] });
  });

  test.prop([spelledAnyWay("local")])(
    "local rozpoznaje bez względu na wielkość liter i białe znaki wokół",
    (provider) => {
      expect(resolveStorageEnv({ STORAGE_PROVIDER: provider }, CWD)).toEqual({
        ok: true,
        env: {
          STORAGE_PROVIDER: "local",
          STORAGE_LOCAL_PATH: "/app/volumes/uploads",
        },
      });
    },
  );

  test.prop([spelledAnyWay("s3")])(
    "s3 rozpoznaje bez względu na wielkość liter i białe znaki wokół",
    (provider) => {
      expect(
        resolveStorageEnv({ STORAGE_PROVIDER: provider, ...S3_OK }, CWD),
      ).toEqual({ ok: true, env: S3_OK_ENV });
    },
  );

  test.prop([
    unknownProvider,
    fc.record({
      NODE_ENV: fc.option(fc.constantFrom("production", "development"), {
        nil: undefined,
      }),
      STORAGE_LOCAL_PATH: anyText,
      RAILWAY_ENVIRONMENT_ID: anyText,
      RAILWAY_VOLUME_MOUNT_PATH: anyText,
    }),
  ])(
    "nieznany provider daje tylko problem STORAGE_PROVIDER, bez reguł local i s3",
    (provider, rest) => {
      expect(
        resolveStorageEnv({ ...rest, STORAGE_PROVIDER: provider }, CWD),
      ).toEqual({ ok: false, issues: [UNKNOWN_PROVIDER] });
    },
  );
});

describe("resolveStorageEnv: katalog providera local", () => {
  it.each<[string, Source, string]>([
    [
      "bezwzględny STORAGE_LOCAL_PATH zostaje katalogiem bez zmian",
      { STORAGE_LOCAL_PATH: "/srv/files" },
      "/srv/files",
    ],
    [
      "względny STORAGE_LOCAL_PATH rozwiązuje od cwd",
      { STORAGE_LOCAL_PATH: "data/u" },
      "/app/data/u",
    ],
    [
      "STORAGE_LOCAL_PATH traci białe znaki wokół",
      { STORAGE_LOCAL_PATH: " /srv/files " },
      "/srv/files",
    ],
    [
      "STORAGE_LOCAL_PATH zachowuje wielkość liter",
      { STORAGE_LOCAL_PATH: "/Srv/Files" },
      "/Srv/Files",
    ],
    [
      "pusty STORAGE_LOCAL_PATH znaczy nieustawiony",
      { STORAGE_LOCAL_PATH: "" },
      "/app/volumes/uploads",
    ],
    [
      "STORAGE_LOCAL_PATH z samych spacji znaczy nieustawiony",
      { STORAGE_LOCAL_PATH: "  " },
      "/app/volumes/uploads",
    ],
    [
      "bez STORAGE_LOCAL_PATH katalogiem jest RAILWAY_VOLUME_MOUNT_PATH",
      { RAILWAY_VOLUME_MOUNT_PATH: "/data" },
      "/data",
    ],
    [
      "RAILWAY_VOLUME_MOUNT_PATH traci białe znaki wokół",
      { RAILWAY_VOLUME_MOUNT_PATH: " /data " },
      "/data",
    ],
    [
      "RAILWAY_VOLUME_MOUNT_PATH zachowuje wielkość liter",
      { RAILWAY_VOLUME_MOUNT_PATH: "/Data" },
      "/Data",
    ],
    [
      "względny RAILWAY_VOLUME_MOUNT_PATH rozwiązuje od cwd",
      { RAILWAY_VOLUME_MOUNT_PATH: "data" },
      "/app/data",
    ],
    [
      "pusty RAILWAY_VOLUME_MOUNT_PATH znaczy nieustawiony",
      { RAILWAY_VOLUME_MOUNT_PATH: "" },
      "/app/volumes/uploads",
    ],
    [
      "RAILWAY_VOLUME_MOUNT_PATH z samych spacji znaczy nieustawiony",
      { RAILWAY_VOLUME_MOUNT_PATH: "  " },
      "/app/volumes/uploads",
    ],
    [
      "STORAGE_LOCAL_PATH ma pierwszeństwo przed RAILWAY_VOLUME_MOUNT_PATH",
      { STORAGE_LOCAL_PATH: "/srv/files", RAILWAY_VOLUME_MOUNT_PATH: "/data" },
      "/srv/files",
    ],
    [
      "poza produkcją Railway bez wolumenu nie zgłasza problemu",
      { RAILWAY_ENVIRONMENT_ID: "e1" },
      "/app/volumes/uploads",
    ],
    [
      "NODE_ENV inny niż production nie włącza reguł produkcyjnych",
      { NODE_ENV: "development", RAILWAY_ENVIRONMENT_ID: "e1" },
      "/app/volumes/uploads",
    ],
    [
      "poza produkcją na Railway ścieżka poza wolumenem nie zgłasza problemu",
      {
        RAILWAY_ENVIRONMENT_ID: "e1",
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "/database",
      },
      "/database",
    ],
  ])("%s", (_scenario, source, expectedPath) => {
    expect(resolveStorageEnv(source, CWD)).toEqual({
      ok: true,
      env: { STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: expectedPath },
    });
  });

  it("zmienne S3_* przy local nie są sprawdzane i nie trafiają do wyniku", () => {
    const result = resolveStorageEnv({ S3_ENDPOINT: "nie-url" }, CWD);

    expect(result).toEqual({
      ok: true,
      env: {
        STORAGE_PROVIDER: "local",
        STORAGE_LOCAL_PATH: "/app/volumes/uploads",
      },
    });
    expect(Object.keys(envOf(result)).sort()).toEqual([
      "STORAGE_LOCAL_PATH",
      "STORAGE_PROVIDER",
    ]);
  });

  it("poprawne S3_* przy STORAGE_PROVIDER=local nie trafiają do wyniku", () => {
    const result = resolveStorageEnv(
      { STORAGE_PROVIDER: "local", ...S3_OK },
      CWD,
    );

    expect(Object.keys(envOf(result)).sort()).toEqual([
      "STORAGE_LOCAL_PATH",
      "STORAGE_PROVIDER",
    ]);
  });

  it.each<[string, Source, string]>([
    ["domyślny katalog leży w podanym cwd", {}, "/srv/app/volumes/uploads"],
    [
      "względny STORAGE_LOCAL_PATH rozwiązuje od podanego cwd",
      { STORAGE_LOCAL_PATH: "data/u" },
      "/srv/app/data/u",
    ],
    [
      "względny STORAGE_LOCAL_PATH porównuje z wolumenem po rozwiązaniu od podanego cwd",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/srv/app/volumes",
        STORAGE_LOCAL_PATH: "volumes/uploads",
      },
      "/srv/app/volumes/uploads",
    ],
    [
      "względny wolumen porównuje po rozwiązaniu od podanego cwd",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "volumes",
        STORAGE_LOCAL_PATH: "/srv/app/volumes/uploads",
      },
      "/srv/app/volumes/uploads",
    ],
  ])("cwd /srv/app: %s", (_scenario, source, expectedPath) => {
    expect(resolveStorageEnv(source, "/srv/app")).toEqual({
      ok: true,
      env: { STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: expectedPath },
    });
  });

  test.prop([
    fc.record({
      STORAGE_PROVIDER: localProvider,
      NODE_ENV: notProduction,
      STORAGE_LOCAL_PATH: anyText,
      RAILWAY_ENVIRONMENT_ID: anyText,
      RAILWAY_VOLUME_MOUNT_PATH: anyText,
      S3_ENDPOINT: anyText,
      S3_REGION: anyText,
      S3_BUCKET: anyText,
      S3_FORCE_PATH_STYLE: anyText,
    }),
  ])(
    "poza produkcją local nigdy nie zgłasza problemu i zwraca tylko provider oraz bezwzględną ścieżkę",
    (source) => {
      const env = envOf(resolveStorageEnv(source, CWD));

      expect(Object.keys(env).sort()).toEqual([
        "STORAGE_LOCAL_PATH",
        "STORAGE_PROVIDER",
      ]);
      expect(env).toEqual({
        STORAGE_PROVIDER: "local",
        STORAGE_LOCAL_PATH: expect.stringMatching(/^\//),
      });
    },
  );
});

describe("resolveStorageEnv: reguły produkcyjne providera local", () => {
  it.each<[string, Source, StorageEnvIssue[]]>([
    [
      "w produkcji poza Railway brak STORAGE_LOCAL_PATH daje problem „wymagana”",
      { NODE_ENV: "production" },
      [PATH_REQUIRED],
    ],
    [
      "w produkcji pusty RAILWAY_ENVIRONMENT_ID znaczy poza Railway",
      { NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "" },
      [PATH_REQUIRED],
    ],
    [
      "w produkcji RAILWAY_ENVIRONMENT_ID z samych spacji znaczy poza Railway",
      { NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "  " },
      [PATH_REQUIRED],
    ],
    [
      "w produkcji sam RAILWAY_VOLUME_MOUNT_PATH bez RAILWAY_ENVIRONMENT_ID nie zastępuje STORAGE_LOCAL_PATH",
      { NODE_ENV: "production", RAILWAY_VOLUME_MOUNT_PATH: "/data" },
      [PATH_REQUIRED],
    ],
    [
      "w produkcji poza Railway względny STORAGE_LOCAL_PATH daje problem „musi być ścieżką bezwzględną”",
      { NODE_ENV: "production", STORAGE_LOCAL_PATH: "./volumes/uploads" },
      [PATH_NOT_ABSOLUTE],
    ],
    [
      "w produkcji poza Railway STORAGE_LOCAL_PATH bez ./ na początku też jest względny i daje problem",
      { NODE_ENV: "production", STORAGE_LOCAL_PATH: "data/u" },
      [PATH_NOT_ABSOLUTE],
    ],
    [
      "w produkcji pusty RAILWAY_ENVIRONMENT_ID znaczy poza Railway, więc względny STORAGE_LOCAL_PATH daje problem",
      {
        NODE_ENV: "production",
        STORAGE_LOCAL_PATH: "./x",
        RAILWAY_ENVIRONMENT_ID: "",
      },
      [PATH_NOT_ABSOLUTE],
    ],
    [
      "w produkcji poza Railway przy jawnym STORAGE_PROVIDER=local względny STORAGE_LOCAL_PATH daje problem",
      {
        NODE_ENV: "production",
        STORAGE_PROVIDER: "local",
        STORAGE_LOCAL_PATH: "./x",
        RAILWAY_ENVIRONMENT_ID: "",
      },
      [PATH_NOT_ABSOLUTE],
    ],
    [
      "w produkcji sam RAILWAY_VOLUME_MOUNT_PATH bez RAILWAY_ENVIRONMENT_ID nie zwalnia z bezwzględnego STORAGE_LOCAL_PATH",
      {
        NODE_ENV: "production",
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "data",
      },
      [PATH_NOT_ABSOLUTE],
    ],
    [
      "w produkcji na Railway bez wolumenu jedynym problemem jest brak wolumenu",
      { ...PRODUCTION_ON_RAILWAY },
      [RAILWAY_WITHOUT_VOLUME],
    ],
    [
      "w produkcji na Railway RAILWAY_VOLUME_MOUNT_PATH z samych spacji znaczy brak wolumenu",
      { ...PRODUCTION_ON_RAILWAY, RAILWAY_VOLUME_MOUNT_PATH: "  " },
      [RAILWAY_WITHOUT_VOLUME],
    ],
    [
      "w produkcji na Railway bez wolumenu jawny STORAGE_LOCAL_PATH nie usuwa problemu",
      { ...PRODUCTION_ON_RAILWAY, STORAGE_LOCAL_PATH: "/srv/files" },
      [RAILWAY_WITHOUT_VOLUME],
    ],
    [
      "w produkcji na Railway katalog o nazwie zaczynającej się jak wolumen leży poza wolumenem",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "/database",
      },
      [OUTSIDE_DATA_VOLUME],
    ],
    [
      "w produkcji na Railway ścieżka wychodząca z wolumenu przez .. leży poza wolumenem",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "/data/../etc",
      },
      [OUTSIDE_DATA_VOLUME],
    ],
    [
      "w produkcji na Railway względny STORAGE_LOCAL_PATH rozwiązuje od cwd, a nie od wolumenu",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "data/uploads",
      },
      [OUTSIDE_DATA_VOLUME],
    ],
    [
      "komunikat o ścieżce poza wolumenem podaje RAILWAY_VOLUME_MOUNT_PATH po trim()",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: " /data/ ",
        STORAGE_LOCAL_PATH: "/database",
      },
      [
        {
          name: "STORAGE_LOCAL_PATH",
          message: "must be inside the Railway volume (/data/)",
        },
      ],
    ],
    [
      "w produkcji na Railway przy jawnym STORAGE_PROVIDER=local ścieżka poza wolumenem też daje problem",
      {
        ...PRODUCTION_ON_RAILWAY,
        STORAGE_PROVIDER: "local",
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "/database",
      },
      [OUTSIDE_DATA_VOLUME],
    ],
  ])("%s", (_scenario, source, issues) => {
    expect(resolveStorageEnv(source, CWD)).toEqual({ ok: false, issues });
  });

  it.each<[string, Source, string]>([
    [
      "w produkcji poza Railway jawny STORAGE_LOCAL_PATH przechodzi, także równy domyślnemu katalogowi",
      { NODE_ENV: "production", STORAGE_LOCAL_PATH: "/app/volumes/uploads" },
      "/app/volumes/uploads",
    ],
    [
      "w produkcji poza Railway STORAGE_LOCAL_PATH bezwzględny po trim() przechodzi",
      { NODE_ENV: "production", STORAGE_LOCAL_PATH: " /srv/files " },
      "/srv/files",
    ],
    [
      "w produkcji poza Railway reguła wolumenu nie działa",
      {
        NODE_ENV: "production",
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "/database",
      },
      "/database",
    ],
    [
      "w produkcji na Railway bez STORAGE_LOCAL_PATH katalogiem jest wolumen",
      { ...PRODUCTION_ON_RAILWAY, RAILWAY_VOLUME_MOUNT_PATH: "/data" },
      "/data",
    ],
    [
      "w produkcji na Railway STORAGE_LOCAL_PATH wewnątrz wolumenu przechodzi",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "/data/uploads",
      },
      "/data/uploads",
    ],
    [
      "w produkcji na Railway ukośnik na końcu wolumenu nie zmienia wyniku porównania",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/data/",
        STORAGE_LOCAL_PATH: "/data/uploads",
      },
      "/data/uploads",
    ],
    [
      "w produkcji na Railway STORAGE_LOCAL_PATH równy wolumenowi przechodzi",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "/data",
      },
      "/data",
    ],
    [
      "w produkcji na Railway względny STORAGE_LOCAL_PATH równy wolumenowi po rozwiązaniu od cwd przechodzi",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/app/volumes/uploads",
        STORAGE_LOCAL_PATH: "./volumes/uploads",
      },
      "/app/volumes/uploads",
    ],
    [
      "w produkcji na Railway względny wolumen rozwiązuje od cwd przed porównaniem",
      {
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "volumes",
        STORAGE_LOCAL_PATH: "/app/volumes/uploads",
      },
      "/app/volumes/uploads",
    ],
    [
      "w produkcji na Railway przy jawnym STORAGE_PROVIDER=local bez STORAGE_LOCAL_PATH katalogiem jest wolumen",
      {
        ...PRODUCTION_ON_RAILWAY,
        STORAGE_PROVIDER: "local",
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
      },
      "/data",
    ],
    [
      "w produkcji poza Railway przy jawnym STORAGE_PROVIDER=local katalogiem jest STORAGE_LOCAL_PATH",
      {
        NODE_ENV: "production",
        STORAGE_PROVIDER: "local",
        STORAGE_LOCAL_PATH: "/srv/files",
      },
      "/srv/files",
    ],
  ])("%s", (_scenario, source, expectedPath) => {
    expect(resolveStorageEnv(source, CWD)).toEqual({
      ok: true,
      env: { STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: expectedPath },
    });
  });

  test.prop([localProvider, railwayEnvironmentId, blankOrMissing, anyText])(
    "w produkcji na Railway bez wolumenu jedynym problemem jest brak wolumenu, cokolwiek jest w STORAGE_LOCAL_PATH",
    (provider, railwayId, volume, explicit) => {
      expect(
        resolveStorageEnv(
          {
            NODE_ENV: "production",
            STORAGE_PROVIDER: provider,
            RAILWAY_ENVIRONMENT_ID: railwayId,
            RAILWAY_VOLUME_MOUNT_PATH: volume,
            STORAGE_LOCAL_PATH: explicit,
          },
          CWD,
        ),
      ).toEqual({ ok: false, issues: [RAILWAY_WITHOUT_VOLUME] });
    },
  );

  test.prop([localProvider, blankOrMissing, blankOrMissing, anyText])(
    "w produkcji poza Railway bez STORAGE_LOCAL_PATH jedynym problemem jest brak ścieżki, także przy ustawionym RAILWAY_VOLUME_MOUNT_PATH",
    (provider, railwayId, explicit, volume) => {
      expect(
        resolveStorageEnv(
          {
            NODE_ENV: "production",
            STORAGE_PROVIDER: provider,
            RAILWAY_ENVIRONMENT_ID: railwayId,
            STORAGE_LOCAL_PATH: explicit,
            RAILWAY_VOLUME_MOUNT_PATH: volume,
          },
          CWD,
        ),
      ).toEqual({ ok: false, issues: [PATH_REQUIRED] });
    },
  );

  test.prop([localProvider, blankOrMissing, relativeLocalPath, anyText])(
    "w produkcji poza Railway względny STORAGE_LOCAL_PATH daje tylko problem „musi być ścieżką bezwzględną”, przy każdej pisowni local i każdym RAILWAY_VOLUME_MOUNT_PATH",
    (provider, railwayId, explicit, volume) => {
      expect(
        resolveStorageEnv(
          {
            NODE_ENV: "production",
            STORAGE_PROVIDER: provider,
            RAILWAY_ENVIRONMENT_ID: railwayId,
            STORAGE_LOCAL_PATH: explicit,
            RAILWAY_VOLUME_MOUNT_PATH: volume,
          },
          CWD,
        ),
      ).toEqual({ ok: false, issues: [PATH_NOT_ABSOLUTE] });
    },
  );

  test.prop([
    localProvider,
    fc.constantFrom<[Source, StorageEnvResult]>(
      [
        { ...PRODUCTION_ON_RAILWAY, RAILWAY_VOLUME_MOUNT_PATH: "/data" },
        {
          ok: true,
          env: { STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: "/data" },
        },
      ],
      [
        { NODE_ENV: "production", STORAGE_LOCAL_PATH: "/srv/files" },
        {
          ok: true,
          env: { STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: "/srv/files" },
        },
      ],
      [
        {
          ...PRODUCTION_ON_RAILWAY,
          RAILWAY_VOLUME_MOUNT_PATH: "/data",
          STORAGE_LOCAL_PATH: "/database",
        },
        { ok: false, issues: [OUTSIDE_DATA_VOLUME] },
      ],
    ),
  ])(
    "w produkcji wolumen jako katalog, jawny STORAGE_LOCAL_PATH i reguła wolumenu działają tak samo przy STORAGE_PROVIDER nieustawionym, pustym i local w dowolnej pisowni",
    (provider, [source, expected]) => {
      expect(
        resolveStorageEnv({ ...source, STORAGE_PROVIDER: provider }, CWD),
      ).toEqual(expected);
    },
  );
});

describe("resolveStorageEnv: provider s3", () => {
  it("„ S3 ” po trim() i zamianie na małe litery wybiera s3 z regionem auto i S3_FORCE_PATH_STYLE false", () => {
    expect(
      resolveStorageEnv({ STORAGE_PROVIDER: " S3 ", ...S3_OK }, CWD),
    ).toEqual({ ok: true, env: S3_OK_ENV });
  });

  it("przenosi podane wartości S3_* do wyniku bez zmian", () => {
    expect(
      resolveStorageEnv(
        {
          STORAGE_PROVIDER: "s3",
          S3_ENDPOINT: "http://localhost:9000",
          S3_REGION: "eu-central-1",
          S3_ACCESS_KEY_ID: "minioadmin",
          S3_SECRET_ACCESS_KEY: "minioadmin-secret",
          S3_BUCKET: "test-bucket",
          S3_FORCE_PATH_STYLE: "true",
        },
        CWD,
      ),
    ).toEqual({
      ok: true,
      env: {
        STORAGE_PROVIDER: "s3",
        S3_ENDPOINT: "http://localhost:9000",
        S3_REGION: "eu-central-1",
        S3_ACCESS_KEY_ID: "minioadmin",
        S3_SECRET_ACCESS_KEY: "minioadmin-secret",
        S3_BUCKET: "test-bucket",
        S3_FORCE_PATH_STYLE: true,
      },
    });
  });

  it("S3_FORCE_PATH_STYLE=true daje true", () => {
    expect(
      resolveStorageEnv(
        { STORAGE_PROVIDER: "s3", ...S3_OK, S3_FORCE_PATH_STYLE: "true" },
        CWD,
      ),
    ).toEqual({ ok: true, env: { ...S3_OK_ENV, S3_FORCE_PATH_STYLE: true } });
  });

  it("S3_FORCE_PATH_STYLE=false daje false", () => {
    expect(
      resolveStorageEnv(
        { STORAGE_PROVIDER: "s3", ...S3_OK, S3_FORCE_PATH_STYLE: "false" },
        CWD,
      ),
    ).toEqual({ ok: true, env: { ...S3_OK_ENV, S3_FORCE_PATH_STYLE: false } });
  });

  it("S3_FORCE_PATH_STYLE spoza true/false daje jeden problem tej zmiennej", () => {
    expect(
      resolveStorageEnv(
        { STORAGE_PROVIDER: "s3", ...S3_OK, S3_FORCE_PATH_STYLE: "tak" },
        CWD,
      ),
    ).toEqual({
      ok: false,
      issues: [{ name: "S3_FORCE_PATH_STYLE", message: ANY_ZOD_MESSAGE }],
    });
  });

  it("S3_ENDPOINT, który nie jest adresem url, daje jeden problem tej zmiennej", () => {
    expect(
      resolveStorageEnv(
        { STORAGE_PROVIDER: "s3", ...S3_OK, S3_ENDPOINT: "nie-url" },
        CWD,
      ),
    ).toEqual({
      ok: false,
      issues: [{ name: "S3_ENDPOINT", message: ANY_ZOD_MESSAGE }],
    });
  });

  it.each(["localhost:9000", "minio:9000", "ftp://localhost:9000"])(
    "S3_ENDPOINT %j without an http or https scheme gives one issue on that variable",
    (endpoint) => {
      expect(
        resolveStorageEnv(
          {
            STORAGE_PROVIDER: "s3",
            S3_ENDPOINT: endpoint,
            S3_ACCESS_KEY_ID: "k",
            S3_SECRET_ACCESS_KEY: "s",
            S3_BUCKET: "b",
          },
          "/app",
        ),
      ).toEqual({
        ok: false,
        issues: [{ name: "S3_ENDPOINT", message: "Invalid URL" }],
      });
    },
  );

  it("S3_ENDPOINT http://localhost:9000 is accepted unchanged", () => {
    expect(
      resolveStorageEnv(
        {
          STORAGE_PROVIDER: "s3",
          S3_ENDPOINT: "http://localhost:9000",
          S3_ACCESS_KEY_ID: "k",
          S3_SECRET_ACCESS_KEY: "s",
          S3_BUCKET: "b",
        },
        "/app",
      ),
    ).toEqual({
      ok: true,
      env: {
        STORAGE_PROVIDER: "s3",
        S3_ENDPOINT: "http://localhost:9000",
        S3_REGION: "auto",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
        S3_BUCKET: "b",
        S3_FORCE_PATH_STYLE: false,
      },
    });
  });

  it.each([
    "S3_ENDPOINT",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ])("brak %s daje jeden problem tej zmiennej", (name) => {
    expect(
      resolveStorageEnv(
        { STORAGE_PROVIDER: "s3", ...S3_OK, [name]: undefined },
        CWD,
      ),
    ).toEqual({ ok: false, issues: [{ name, message: ANY_ZOD_MESSAGE }] });
  });

  it.each([
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
  ])("pusty %s daje jeden problem tej zmiennej", (name) => {
    expect(
      resolveStorageEnv({ STORAGE_PROVIDER: "s3", ...S3_OK, [name]: "" }, CWD),
    ).toEqual({ ok: false, issues: [{ name, message: ANY_ZOD_MESSAGE }] });
  });

  it("bez żadnej zmiennej S3_* zgłasza naraz brak czterech wymaganych", () => {
    expect(
      issueNamesOf(resolveStorageEnv({ STORAGE_PROVIDER: "s3" }, CWD)),
    ).toEqual([
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_SECRET_ACCESS_KEY",
    ]);
  });

  it("wynik s3 ma tylko STORAGE_PROVIDER i sześć pól S3_*, bez innych kluczy z source", () => {
    const result = resolveStorageEnv(
      {
        STORAGE_PROVIDER: "s3",
        ...S3_OK,
        STORAGE_LOCAL_PATH: "/srv/files",
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        DATABASE_URL: "postgres://x",
      },
      CWD,
    );

    expect(Object.keys(envOf(result)).sort()).toEqual([
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_FORCE_PATH_STYLE",
      "S3_REGION",
      "S3_SECRET_ACCESS_KEY",
      "STORAGE_PROVIDER",
    ]);
  });

  it.each<[string, Source]>([
    [
      "w produkcji na Railway bez wolumenu s3 nie podlega regułom local",
      { STORAGE_PROVIDER: "s3", ...S3_OK, ...PRODUCTION_ON_RAILWAY },
    ],
    [
      "w produkcji poza Railway s3 nie wymaga STORAGE_LOCAL_PATH",
      { STORAGE_PROVIDER: "s3", ...S3_OK, NODE_ENV: "production" },
    ],
    [
      "w produkcji poza Railway s3 nie sprawdza, czy STORAGE_LOCAL_PATH jest bezwzględny",
      {
        STORAGE_PROVIDER: "s3",
        ...S3_OK,
        NODE_ENV: "production",
        STORAGE_LOCAL_PATH: "./x",
      },
    ],
    [
      "w produkcji na Railway s3 nie sprawdza STORAGE_LOCAL_PATH względem wolumenu",
      {
        STORAGE_PROVIDER: "s3",
        ...S3_OK,
        ...PRODUCTION_ON_RAILWAY,
        RAILWAY_VOLUME_MOUNT_PATH: "/data",
        STORAGE_LOCAL_PATH: "/database",
      },
    ],
  ])("%s", (_scenario, source) => {
    expect(resolveStorageEnv(source, CWD)).toEqual({
      ok: true,
      env: S3_OK_ENV,
    });
  });
});

describe("resolveStorageEnv: S3_SESSION_TOKEN", () => {
  const S3_WITH_LOCAL_ENDPOINT = {
    STORAGE_PROVIDER: "s3",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_ACCESS_KEY_ID: "k",
    S3_SECRET_ACCESS_KEY: "s",
    S3_BUCKET: "b",
  };

  it("passes a set session token through to the s3 env", () => {
    expect(
      resolveStorageEnv(
        { ...S3_WITH_LOCAL_ENDPOINT, S3_SESSION_TOKEN: "tok" },
        "/app",
      ),
    ).toStrictEqual({
      ok: true,
      env: {
        STORAGE_PROVIDER: "s3",
        S3_ENDPOINT: "http://127.0.0.1:9000",
        S3_REGION: "auto",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
        S3_BUCKET: "b",
        S3_FORCE_PATH_STYLE: false,
        S3_SESSION_TOKEN: "tok",
      },
    });
  });

  it.each<[string, string | undefined]>([
    ["a token of spaces", "   "],
    ["an empty token", ""],
    ["no token", undefined],
  ])("with %s the s3 env has no session token value", (_case, token) => {
    const result = resolveStorageEnv(
      { ...S3_WITH_LOCAL_ENDPOINT, S3_SESSION_TOKEN: token },
      "/app",
    );

    expect(result).toEqual({
      ok: true,
      env: {
        STORAGE_PROVIDER: "s3",
        S3_ENDPOINT: "http://127.0.0.1:9000",
        S3_REGION: "auto",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
        S3_BUCKET: "b",
        S3_FORCE_PATH_STYLE: false,
      },
    });
    expect(Object.entries(envOf(result))).not.toContainEqual([
      "S3_SESSION_TOKEN",
      token,
    ]);
  });

  it("the s3 env with a session token has the session token among its keys", () => {
    const result = resolveStorageEnv(
      { STORAGE_PROVIDER: "s3", ...S3_OK, S3_SESSION_TOKEN: "tok" },
      CWD,
    );

    expect(Object.keys(envOf(result)).sort()).toEqual([
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_FORCE_PATH_STYLE",
      "S3_REGION",
      "S3_SECRET_ACCESS_KEY",
      "S3_SESSION_TOKEN",
      "STORAGE_PROVIDER",
    ]);
  });

  it("a session token does not make local storage pick up S3 settings", () => {
    expect(
      resolveStorageEnv(
        { STORAGE_PROVIDER: "local", S3_SESSION_TOKEN: "tok" },
        CWD,
      ),
    ).toStrictEqual({
      ok: true,
      env: {
        STORAGE_PROVIDER: "local",
        STORAGE_LOCAL_PATH: "/app/volumes/uploads",
      },
    });
  });

  test.prop([fc.stringMatching(/^[A-Za-z0-9+/=]{1,64}$/)])(
    "any non-blank session token reaches the s3 env unchanged",
    (token) => {
      expect(
        resolveStorageEnv(
          { STORAGE_PROVIDER: "s3", ...S3_OK, S3_SESSION_TOKEN: token },
          CWD,
        ),
      ).toEqual({ ok: true, env: { ...S3_OK_ENV, S3_SESSION_TOKEN: token } });
    },
  );

  test.prop([whitespace])(
    "any whitespace-only session token leaves the s3 env without a token",
    (token) => {
      expect(
        resolveStorageEnv(
          { STORAGE_PROVIDER: "s3", ...S3_OK, S3_SESSION_TOKEN: token },
          CWD,
        ),
      ).toEqual({ ok: true, env: S3_OK_ENV });
    },
  );
});
