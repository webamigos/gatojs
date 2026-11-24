import { describe, expect, it } from "vitest";
import { parseCliArgs, USAGE, type CreateCliArgs } from "../args.js";

const DEFAULTS: CreateCliArgs = {
  kind: "create",
  target: "my-app",
  kitVersion: null,
  kitPath: null,
  modules: null,
  locales: null,
  title: null,
  adminEmail: null,
  yes: false,
  setup: false,
  install: true,
  docker: true,
  git: true,
  cliSource: null,
  storage: null,
  s3Endpoint: null,
  s3AccessKeyId: null,
  s3SecretAccessKey: null,
  mailProvider: null,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpPass: null,
  resendApiKey: null,
};

describe("parseCliArgs: pomoc i wersja", () => {
  it.each([
    [["--help"]],
    [["-h"]],
    [["my-app", "--help"]],
    [["my-app", "--yes", "-h"]],
  ])("%j zwraca pomoc", (argv) => {
    expect(parseCliArgs(argv)).toEqual({ kind: "help" });
  });

  it.each([[["--version"]], [["-v"]], [["my-app", "--version"]]])(
    "%j zwraca wersję",
    (argv) => {
      expect(parseCliArgs(argv)).toEqual({ kind: "version" });
    },
  );

  it.each([
    [["--version", "--help"]],
    [["--help", "--version"]],
    [["-v", "-h"]],
  ])("%j woli pomoc niż wersję", (argv) => {
    expect(parseCliArgs(argv)).toEqual({ kind: "help" });
  });
});

describe("parseCliArgs: katalog projektu", () => {
  it("sam katalog daje wartości domyślne", () => {
    expect(parseCliArgs(["my-app"])).toStrictEqual(DEFAULTS);
  });

  it.each([
    [[]],
    [[""]],
    [["--yes"]],
    [["", "--yes"]],
    [["--title", "Acme"]],
    [["--kit", "../gatojs"]],
  ])("%j bez katalogu jest odrzucone", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(/^Missing project directory\./);
  });

  it("drugi argument pozycyjny jest odrzucony", () => {
    expect(() => parseCliArgs(["my-app", "other"])).toThrow(
      "Unexpected argument: other",
    );
  });

  it.each([
    [["--title", "Acme App", "my-app"]],
    [["--modules", "uploads", "my-app"]],
    [["--cli-source", "/t/x.tgz", "my-app"]],
  ])("%j nie bierze wartości flagi za katalog", (argv) => {
    expect(parseCliArgs(argv)).toMatchObject({
      kind: "create",
      target: "my-app",
    });
  });

  it("nieznana flaga jest odrzucona", () => {
    expect(() => parseCliArgs(["my-app", "--nope"])).toThrow(
      "Unknown option: --nope",
    );
  });

  it("nieznana flaga z wartością po = jest odrzucona po nazwie", () => {
    expect(() => parseCliArgs(["my-app", "--frobnicate=1"])).toThrow(
      /^Unknown option: --frobnicate/,
    );
  });

  it.each([
    "--title",
    "--modules",
    "--locales",
    "--admin-email",
    "--cli-source",
    "--storage",
    "--s3-endpoint",
    "--mail-provider",
    "--smtp-host",
    "--smtp-port",
    "--smtp-user",
    "--smtp-pass",
    "--resend-api-key",
  ])("%s na końcu bez wartości jest odrzucone", (flag) => {
    expect(() => parseCliArgs(["my-app", flag])).toThrow(
      `${flag} needs a value`,
    );
  });
});

describe("parseCliArgs: --modules", () => {
  it("pusty napis to pusta lista modułów", () => {
    expect(parseCliArgs(["my-app", "--modules", ""])).toMatchObject({
      modules: [],
    });
  });

  it("lista po przecinku jest przycięta", () => {
    expect(
      parseCliArgs(["my-app", "--modules", "api-keys, uploads"]),
    ).toMatchObject({
      modules: ["api-keys", "uploads"],
    });
  });

  it("działa forma --modules=wartość", () => {
    expect(parseCliArgs(["my-app", "--modules=uploads"])).toMatchObject({
      modules: ["uploads"],
    });
  });
});

describe("parseCliArgs: --locales", () => {
  it.each([
    ["pl", ["pl"]],
    ["pl,en", ["pl", "en"]],
  ])("%s daje %j", (value, expected) => {
    expect(parseCliArgs(["my-app", "--locales", value])).toMatchObject({
      locales: expected,
    });
  });

  it.each(["en", "pl,de", "pl,pl", "de", "en,pl,de"])(
    "%j jest odrzucone, bo polski jest wymagany",
    (value) => {
      expect(() => parseCliArgs(["my-app", "--locales", value])).toThrow(
        "--locales: use pl or pl,en (pl is required)",
      );
    },
  );
});

describe("parseCliArgs: --title i --admin-email", () => {
  it("tytuł jest przycięty", () => {
    expect(parseCliArgs(["my-app", "--title", "  Acme  "])).toMatchObject({
      title: "Acme",
    });
  });

  it("działa forma --title=wartość ze spacjami", () => {
    expect(parseCliArgs(["my-app", "--title=Acme Shop"])).toMatchObject({
      title: "Acme Shop",
    });
  });

  it.each(['A"B', "A$B", "x".repeat(61), "   "])(
    "niepoprawny tytuł %j jest odrzucony z przedrostkiem --title",
    (value) => {
      expect(() => parseCliArgs(["my-app", "--title", value])).toThrow(
        /^--title: /,
      );
    },
  );

  it("poprawny e-mail jest zachowany", () => {
    expect(parseCliArgs(["my-app", "--admin-email", "a@b.co"])).toMatchObject({
      adminEmail: "a@b.co",
    });
  });

  it.each(["nope", "a@b", "a b@example.com"])(
    "niepoprawny e-mail %j jest odrzucony z przedrostkiem --admin-email",
    (value) => {
      expect(() => parseCliArgs(["my-app", "--admin-email", value])).toThrow(
        /^--admin-email: /,
      );
    },
  );
});

describe("parseCliArgs: instalacja, Docker, git i setup", () => {
  it.each([["--skip-install"], ["--no-install"]])(
    "%s wyłącza instalację i Dockera",
    (flag) => {
      expect(parseCliArgs(["my-app", flag])).toStrictEqual({
        ...DEFAULTS,
        install: false,
        docker: false,
      });
    },
  );

  it("--skip-docker wyłącza tylko Dockera", () => {
    expect(parseCliArgs(["my-app", "--skip-docker"])).toStrictEqual({
      ...DEFAULTS,
      docker: false,
    });
  });

  it("--no-git wyłącza git", () => {
    expect(parseCliArgs(["my-app", "--no-git"])).toStrictEqual({
      ...DEFAULTS,
      git: false,
    });
  });

  it("--yes ustawia yes", () => {
    expect(parseCliArgs(["my-app", "--yes"])).toStrictEqual({
      ...DEFAULTS,
      yes: true,
    });
  });

  it("--setup ustawia setup", () => {
    expect(parseCliArgs(["my-app", "--setup"])).toStrictEqual({
      ...DEFAULTS,
      setup: true,
    });
  });

  it.each([
    [["my-app", "--setup", "--skip-install"]],
    [["my-app", "--setup", "--skip-docker"]],
    [["my-app", "--skip-docker", "--setup"]],
    [["my-app", "--no-install", "--setup"]],
  ])("%j jest sprzeczne", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(
      "--setup needs npm install and Docker; drop --skip-install/--skip-docker",
    );
  });

  it("--cli-source zapisuje ścieżkę", () => {
    expect(parseCliArgs(["my-app", "--cli-source", "x.tgz"])).toMatchObject({
      cliSource: "x.tgz",
    });
  });

  it("działa forma --cli-source=ścieżka", () => {
    expect(parseCliArgs(["--cli-source=/t/x.tgz", "my-app"])).toMatchObject({
      cliSource: "/t/x.tgz",
      target: "my-app",
    });
  });
});

describe("parseCliArgs: magazyn plików", () => {
  it.each([
    ["s3", "s3"],
    ["local", "local"],
  ])("--storage %s daje %s", (value, expected) => {
    expect(parseCliArgs(["my-app", "--storage", value])).toMatchObject({
      storage: expected,
    });
  });

  it("--storage gcs jest odrzucone", () => {
    expect(() => parseCliArgs(["my-app", "--storage", "gcs"])).toThrow(
      "--storage: use local or s3",
    );
  });

  it.each([
    ["--s3-endpoint", "https://s3.example.com"],
    ["--s3-access-key-id", "AK"],
    ["--s3-secret-access-key", "SK"],
  ])("%s bez --storage s3 jest odrzucone", (flag, value) => {
    expect(() => parseCliArgs(["my-app", flag, value])).toThrow(
      `${flag} needs --storage s3`,
    );
    expect(() =>
      parseCliArgs(["my-app", "--storage", "local", flag, value]),
    ).toThrow(`${flag} needs --storage s3`);
  });

  it("endpoint spoza http(s) jest odrzucony", () => {
    expect(() =>
      parseCliArgs(["my-app", "--storage", "s3", "--s3-endpoint", "ftp://x"]),
    ).toThrow("--s3-endpoint: expected an http(s) URL");
  });

  it("pełna konfiguracja S3 jest zachowana", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--storage=s3",
        "--s3-endpoint",
        "https://s3.example.com",
        "--s3-access-key-id",
        "AK",
        "--s3-secret-access-key=SK/+=",
      ]),
    ).toStrictEqual({
      ...DEFAULTS,
      storage: "s3",
      s3Endpoint: "https://s3.example.com",
      s3AccessKeyId: "AK",
      s3SecretAccessKey: "SK/+=",
    });
  });

  it.each([
    [[]],
    [["--s3-access-key-id", "AK"]],
    [["--s3-secret-access-key", "SK"]],
  ])(
    "--yes z zewnętrznym endpointem bez obu kluczy (%j) jest odrzucone",
    (keys) => {
      expect(() =>
        parseCliArgs([
          "my-app",
          "--yes",
          "--storage",
          "s3",
          "--s3-endpoint",
          "https://s3.example.com",
          ...keys,
        ]),
      ).toThrow(
        "--storage s3 with --s3-endpoint needs --s3-access-key-id and --s3-secret-access-key (or drop --yes to be asked)",
      );
    },
  );

  it("bez --yes brakujące klucze zostaną zadane w pytaniach", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--storage",
        "s3",
        "--s3-endpoint",
        "https://s3.example.com",
      ]),
    ).toMatchObject({
      storage: "s3",
      s3Endpoint: "https://s3.example.com",
      s3AccessKeyId: null,
    });
  });

  it("--yes z lokalnym MinIO nie wymaga kluczy", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--yes",
        "--storage",
        "s3",
        "--s3-endpoint",
        "http://localhost:9000",
      ]),
    ).toMatchObject({ storage: "s3", s3Endpoint: "http://localhost:9000" });
  });

  it.each(["a b", 'a"b', "a#b", "a$b"])(
    "sekret S3 %j niebezpieczny w .env jest odrzucony",
    (value) => {
      expect(() =>
        parseCliArgs([
          "my-app",
          "--storage",
          "s3",
          "--s3-endpoint",
          "https://s3.example.com",
          "--s3-secret-access-key",
          value,
        ]),
      ).toThrow(/no spaces, quotes, backslashes, #, \$ or backticks/);
    },
  );
});

describe("parseCliArgs: --kit i --kit-version", () => {
  it.each([
    [["my-app", "--kit-version", "0.1.0"]],
    [["my-app", "--kit-version=0.1.0"]],
    [["--kit-version", "0.1.0", "my-app"]],
  ])("%j ustawia kitVersion", (argv) => {
    expect(parseCliArgs(argv)).toStrictEqual({
      ...DEFAULTS,
      kitVersion: "0.1.0",
    });
  });

  it.each([
    [["my-app", "--kit-version", "v0.2.3"]],
    [["my-app", "--kit-version=v0.2.3"]],
  ])("%j obcina przedrostek v", (argv) => {
    expect(parseCliArgs(argv)).toMatchObject({ kitVersion: "0.2.3" });
  });

  it.each(["1.2.3", "100.0.0", "10.20.300"])(
    "--kit-version %s jest zachowane",
    (value) => {
      expect(parseCliArgs(["my-app", "--kit-version", value])).toMatchObject({
        kitVersion: value,
      });
    },
  );

  it.each(["1.0", "latest", "1.0.0-rc.1", "01.0.0", "1.0.0.1", "v1.0"])(
    "--kit-version %s nie jest x.y.z",
    (value) => {
      expect(() => parseCliArgs(["my-app", "--kit-version", value])).toThrow(
        `--kit-version: expected x.y.z, got "${value}"`,
      );
    },
  );

  it.each([
    [["my-app", "--kit-version"]],
    [["my-app", "--kit-version", "--yes"]],
    [["my-app", "--kit-version="]],
  ])("%j bez wartości --kit-version jest odrzucone", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(
      "--kit-version needs a value, e.g. --kit-version 0.1.0",
    );
  });

  it.each([
    [["my-app", "--kit", "../gatojs"]],
    [["my-app", "--kit=../gatojs"]],
    [["--kit", "../gatojs", "my-app"]],
  ])("%j ustawia kitPath", (argv) => {
    expect(parseCliArgs(argv)).toStrictEqual({
      ...DEFAULTS,
      kitPath: "../gatojs",
    });
  });

  it.each([
    [["my-app", "--kit"]],
    [["my-app", "--kit="]],
    [["my-app", "--kit", "--yes"]],
  ])("%j bez ścieżki --kit jest odrzucone", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow("--kit needs a path");
  });

  it.each([
    [["my-app", "--kit", "../gatojs", "--kit-version", "0.1.0"]],
    [["my-app", "--kit-version=0.1.0", "--kit=../gatojs"]],
  ])("%j: --kit i --kit-version razem są odrzucone", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(
      "--kit and --kit-version cannot be used together",
    );
  });

  it("--kit podane dwa razy jest odrzucone", () => {
    expect(() =>
      parseCliArgs(["my-app", "--kit", "../a", "--kit", "../b"]),
    ).toThrow("--kit given more than once");
  });

  it("--kit-version podane dwa razy jest odrzucone", () => {
    expect(() =>
      parseCliArgs(["my-app", "--kit-version", "0.1.0", "--kit-version=0.2.0"]),
    ).toThrow("--kit-version given more than once");
  });
});

describe("parseCliArgs: wszystkie flagi razem", () => {
  it("każda flaga trafia do swojego pola", () => {
    expect(
      parseCliArgs([
        "--yes",
        "my-app",
        "--kit",
        "../gatojs",
        "--modules",
        "uploads,api-keys",
        "--locales=pl",
        "--title",
        "Acme",
        "--admin-email=a@b.co",
        "--no-git",
        "--setup",
        "--cli-source",
        "/t/x.tgz",
        "--storage",
        "local",
      ]),
    ).toStrictEqual({
      ...DEFAULTS,
      kitPath: "../gatojs",
      modules: ["uploads", "api-keys"],
      locales: ["pl"],
      title: "Acme",
      adminEmail: "a@b.co",
      yes: true,
      setup: true,
      git: false,
      cliSource: "/t/x.tgz",
      storage: "local",
    });
  });
});

describe("parseCliArgs: mail", () => {
  it.each(["smtp", "resend", "console"])(
    "--mail-provider %s sets mailProvider",
    (value) => {
      expect(parseCliArgs(["my-app", "--mail-provider", value])).toStrictEqual({
        ...DEFAULTS,
        mailProvider: value,
      });
    },
  );

  it("accepts the --mail-provider=value form", () => {
    expect(parseCliArgs(["my-app", "--mail-provider=console"])).toMatchObject({
      mailProvider: "console",
    });
  });

  it.each(["sendgrid", "SMTP", "ses", "smtp,resend"])(
    "--mail-provider %j is rejected",
    (value) => {
      expect(() => parseCliArgs(["my-app", "--mail-provider", value])).toThrow(
        "--mail-provider: use smtp, resend or console",
      );
    },
  );

  it.each([
    ["--smtp-host", "relay.internal"],
    ["--smtp-port", "587"],
    ["--smtp-user", "app"],
    ["--smtp-pass", "pw"],
  ])("%s without --mail-provider smtp is rejected", (flag, value) => {
    const message = `${flag} needs --mail-provider smtp`;
    expect(() => parseCliArgs(["my-app", flag, value])).toThrow(message);
    expect(() =>
      parseCliArgs(["my-app", "--mail-provider", "resend", flag, value]),
    ).toThrow(message);
    expect(() =>
      parseCliArgs(["my-app", "--mail-provider", "console", flag, value]),
    ).toThrow(message);
  });

  it("--resend-api-key without --mail-provider resend is rejected", () => {
    const message = "--resend-api-key needs --mail-provider resend";
    expect(() => parseCliArgs(["my-app", "--resend-api-key", "re_x"])).toThrow(
      message,
    );
    expect(() =>
      parseCliArgs([
        "my-app",
        "--mail-provider",
        "smtp",
        "--resend-api-key",
        "re_x",
      ]),
    ).toThrow(message);
    expect(() =>
      parseCliArgs([
        "my-app",
        "--mail-provider",
        "console",
        "--resend-api-key",
        "re_x",
      ]),
    ).toThrow(message);
  });

  it.each(["70000", "0", "65536", "25.5", "abc", "587abc"])(
    "--smtp-port %j is not a port",
    (value) => {
      expect(() =>
        parseCliArgs([
          "my-app",
          "--mail-provider",
          "smtp",
          "--smtp-port",
          value,
        ]),
      ).toThrow("--smtp-port: expected a port 1-65535");
    },
  );

  it.each([
    ["1", 1],
    ["65535", 65535],
    ["587", 587],
    ["2525", 2525],
  ])("--smtp-port %s parses to the number %d", (value, expected) => {
    expect(
      parseCliArgs(["my-app", "--mail-provider", "smtp", "--smtp-port", value]),
    ).toMatchObject({
      smtpPort: expected,
    });
  });

  it("keeps the full SMTP relay configuration", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--mail-provider",
        "smtp",
        "--smtp-host",
        "relay.internal",
        "--smtp-port=2525",
        "--smtp-user",
        "app",
        "--smtp-pass",
        "pw",
      ]),
    ).toStrictEqual({
      ...DEFAULTS,
      mailProvider: "smtp",
      smtpHost: "relay.internal",
      smtpPort: 2525,
      smtpUser: "app",
      smtpPass: "pw",
    });
  });

  it("keeps the Resend key", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--mail-provider",
        "resend",
        "--resend-api-key",
        "re_x",
      ]),
    ).toStrictEqual({
      ...DEFAULTS,
      mailProvider: "resend",
      resendApiKey: "re_x",
    });
  });

  it("--yes --mail-provider resend without --resend-api-key is rejected", () => {
    expect(() =>
      parseCliArgs(["my-app", "--yes", "--mail-provider", "resend"]),
    ).toThrow(
      "--mail-provider resend needs --resend-api-key (or drop --yes to be asked)",
    );
  });

  it("--mail-provider resend without --yes leaves the key to the question", () => {
    expect(parseCliArgs(["my-app", "--mail-provider", "resend"])).toStrictEqual(
      {
        ...DEFAULTS,
        mailProvider: "resend",
      },
    );
  });

  it("--yes --mail-provider resend with a key is accepted", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--yes",
        "--mail-provider",
        "resend",
        "--resend-api-key",
        "re_x",
      ]),
    ).toStrictEqual({
      ...DEFAULTS,
      yes: true,
      mailProvider: "resend",
      resendApiKey: "re_x",
    });
  });

  it("--yes --mail-provider smtp --smtp-user without --smtp-pass is rejected", () => {
    expect(() =>
      parseCliArgs([
        "my-app",
        "--yes",
        "--mail-provider",
        "smtp",
        "--smtp-user",
        "app",
      ]),
    ).toThrow("--smtp-user needs --smtp-pass (or drop --yes to be asked)");
  });

  it("--smtp-user without --smtp-pass and without --yes leaves the password to the question", () => {
    expect(
      parseCliArgs(["my-app", "--mail-provider", "smtp", "--smtp-user", "app"]),
    ).toStrictEqual({
      ...DEFAULTS,
      mailProvider: "smtp",
      smtpUser: "app",
    });
  });

  it("--yes with --smtp-user and --smtp-pass is accepted", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--yes",
        "--mail-provider",
        "smtp",
        "--smtp-user",
        "app",
        "--smtp-pass",
        "pw",
      ]),
    ).toStrictEqual({
      ...DEFAULTS,
      yes: true,
      mailProvider: "smtp",
      smtpUser: "app",
      smtpPass: "pw",
    });
  });

  it.each([
    [["--yes"]],
    [["--yes", "--mail-provider", "smtp"]],
    [["--yes", "--mail-provider", "console"]],
  ])("%j needs no mail credentials", (flags) => {
    expect(() => parseCliArgs(["my-app", ...flags])).not.toThrow();
  });

  it.each([
    [
      "--smtp-host",
      "relay x",
      "--smtp-host: SMTP host: no spaces, quotes, backslashes, #, $ or backticks",
    ],
    [
      "--smtp-user",
      "app user",
      "--smtp-user: SMTP user: no spaces, quotes, backslashes, #, $ or backticks",
    ],
    [
      "--smtp-pass",
      "p w",
      "--smtp-pass: SMTP password: no spaces, quotes, backslashes, #, $ or backticks",
    ],
    [
      "--smtp-pass",
      "x\nMAIL_PROVIDER=console",
      "--smtp-pass: SMTP password: no spaces, quotes, backslashes, #, $ or backticks",
    ],
  ])(
    "%s %j unsafe in .env is rejected with the flag and its label",
    (flag, value, message) => {
      expect(() =>
        parseCliArgs(["my-app", "--mail-provider", "smtp", flag, value]),
      ).toThrow(new Error(message));
    },
  );

  it("--resend-api-key unsafe in .env is rejected with the flag and its label", () => {
    expect(() =>
      parseCliArgs([
        "my-app",
        "--mail-provider",
        "resend",
        "--resend-api-key",
        "re x",
      ]),
    ).toThrow(
      new Error(
        "--resend-api-key: Resend API key: no spaces, quotes, backslashes, #, $ or backticks",
      ),
    );
  });
});

describe("USAGE", () => {
  it("describes every mail flag with its value", () => {
    for (const line of [
      "--mail-provider <smtp|resend|console>",
      "--smtp-host <host>",
      "--smtp-port <port>",
      "--smtp-user <user>",
      "--smtp-pass <pass>",
      "--resend-api-key <key>",
    ]) {
      expect(USAGE).toContain(line);
    }
  });

  it("opisuje polecenie i wszystkie flagi kreatora", () => {
    expect(USAGE).toContain("create-gato-app <dir>");
    for (const flag of [
      "--kit-version",
      "--modules",
      "--locales",
      "--title",
      "--admin-email",
      "--yes",
      "--setup",
      "--skip-install",
      "--skip-docker",
      "--no-git",
      "--cli-source",
      "--storage",
      "--s3-endpoint",
      "--s3-access-key-id",
      "--s3-secret-access-key",
    ]) {
      expect(USAGE).toContain(flag);
    }
    expect(USAGE).toMatch(/--kit(?!-)/);
  });

  it("opisuje token jako obejście limitów, nie dostęp do prywatnego repozytorium", () => {
    expect(USAGE.split("\n")).toContain(
      "Rate limits: set GITHUB_TOKEN or GH_TOKEN, or log in with `gh auth login`.",
    );
    expect(
      USAGE.split("\n").filter((line) => line.startsWith("Private repository")),
    ).toEqual([]);
  });
});

describe("parseCliArgs: wstrzyknięcia i flagi bez wartości", () => {
  it.each(["https://x y", "https://x\nA=1", "see https://x"])(
    "--s3-endpoint %j jest odrzucony",
    (value) => {
      expect(() =>
        parseCliArgs(["my-app", "--storage", "s3", "--s3-endpoint", value]),
      ).toThrow("--s3-endpoint: expected an http(s) URL");
    },
  );

  it("klucz dostępu S3 ze spacją jest odrzucony z etykietą", () => {
    expect(() =>
      parseCliArgs([
        "my-app",
        "--storage",
        "s3",
        "--s3-endpoint",
        "https://s3.example.com",
        "--s3-access-key-id",
        "a b",
      ]),
    ).toThrow(
      "--s3-access-key-id: S3 access key id: no spaces, quotes, backslashes, #, $ or backticks",
    );
  });

  it("--yes z zewnętrznym endpointem i oboma kluczami jest przyjęte", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--yes",
        "--storage",
        "s3",
        "--s3-endpoint",
        "https://s3.example.com",
        "--s3-access-key-id",
        "AK",
        "--s3-secret-access-key",
        "SK",
      ]),
    ).toStrictEqual({
      ...DEFAULTS,
      yes: true,
      storage: "s3",
      s3Endpoint: "https://s3.example.com",
      s3AccessKeyId: "AK",
      s3SecretAccessKey: "SK",
    });
  });

  it("--yes=1 jest odrzucone, bo --yes nie ma wartości", () => {
    expect(() => parseCliArgs(["my-app", "--yes=1"])).toThrow(
      "--yes does not take a value",
    );
  });
});
