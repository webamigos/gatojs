import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  busyPortsReport,
  FREE_PORT_SEARCH_LIMIT,
  movedPortsReport,
  portAssignments,
  portSettings,
  publishedPorts,
  suggestFreePort,
  type PublishedPort,
} from "../compose-ports.js";
import { KIT_COMPOSE } from "./kit-fixture.js";

const DB: PublishedPort = { service: "db", variable: "DB_PORT", port: 5432 };
const MAIL_UI: PublishedPort = {
  service: "mail",
  variable: "MAILPIT_UI_PORT",
  port: 8025,
};
const MAIL_SMTP: PublishedPort = {
  service: "mail",
  variable: "MAILPIT_SMTP_PORT",
  port: 1025,
};
const MINIO: PublishedPort = {
  service: "minio",
  variable: "MINIO_PORT",
  port: 9000,
};
const MINIO_CONSOLE: PublishedPort = {
  service: "minio",
  variable: "MINIO_CONSOLE_PORT",
  port: 9001,
};
const WEB: PublishedPort = { service: "web", variable: null, port: 8080 };

const ENV_TEXT =
  "DATABASE_URL=postgresql://localhost:5432/acme_shop\nSMTP_URL=smtp://localhost:1025\n";

const DEV_CREDENTIALS = "postgres:postgres";

const CREDENTIALED_ENV_TEXT = `DATABASE_URL=postgresql://${DEV_CREDENTIALS}@localhost:5432/acme_shop\n`;

const MOVED_DEV_DATABASE = {
  protocol: "postgresql:",
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  port: "5433",
  pathname: "/acme_shop",
  search: "",
  hash: "",
};

function urlParts(url: string | undefined) {
  const parsed = new URL(url ?? "");
  return {
    protocol: parsed.protocol,
    username: parsed.username,
    password: parsed.password,
    hostname: parsed.hostname,
    port: parsed.port,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
}

const CUSTOM_COMPOSE = `services:
  web:
    image: nginx
    ports:
      - "8080:80"
      - 3000
      - \${X_PORT:-7000}:70
`;

describe("publishedPorts", () => {
  it("bez profili zwraca porty db i mail w kolejności pliku", () => {
    expect(
      publishedPorts(KIT_COMPOSE, { profiles: [], env: {} }),
    ).toStrictEqual([DB, MAIL_UI, MAIL_SMTP]);
  });

  it("profil s3 dokłada porty minio, a minio-init nic nie publikuje", () => {
    expect(
      publishedPorts(KIT_COMPOSE, { profiles: ["s3"], env: {} }),
    ).toStrictEqual([DB, MAIL_UI, MAIL_SMTP, MINIO, MINIO_CONSOLE]);
  });

  it("inny profil nie włącza usług z profilem s3", () => {
    expect(
      publishedPorts(KIT_COMPOSE, { profiles: ["other"], env: {} }),
    ).toStrictEqual([DB, MAIL_UI, MAIL_SMTP]);
  });

  it("zmienna środowiskowa nadpisuje domyślny port", () => {
    expect(
      publishedPorts(KIT_COMPOSE, { profiles: [], env: { DB_PORT: "5544" } }),
    ).toStrictEqual([
      { service: "db", variable: "DB_PORT", port: 5544 },
      MAIL_UI,
      MAIL_SMTP,
    ]);
  });

  it("nadpisanie portu minio działa tylko z profilem", () => {
    expect(
      publishedPorts(KIT_COMPOSE, {
        profiles: ["s3"],
        env: { MINIO_CONSOLE_PORT: "9101" },
      }),
    ).toContainEqual({
      service: "minio",
      variable: "MINIO_CONSOLE_PORT",
      port: 9101,
    });
  });

  it.each([["abc"], [""], ["12ab"]])(
    "niepoprawna wartość %j daje port domyślny",
    (value) => {
      expect(
        publishedPorts(KIT_COMPOSE, {
          profiles: [],
          env: { DB_PORT: value },
        })[0],
      ).toStrictEqual(DB);
    },
  );

  it("dosłowne mapowanie ma port bez zmiennej, sam port kontenera nic nie publikuje, niecytowana zmienna działa", () => {
    expect(
      publishedPorts(CUSTOM_COMPOSE, { profiles: [], env: {} }),
    ).toStrictEqual([WEB, { service: "web", variable: "X_PORT", port: 7000 }]);
  });
});

describe("suggestFreePort", () => {
  it("pomija zajęte i już przydzielone porty", async () => {
    await expect(
      suggestFreePort(5432, async (port) => port === 5433, [5434]),
    ).resolves.toBe(5435);
  });

  it("nigdy nie zwraca zajętego portu wyjściowego", async () => {
    await expect(
      suggestFreePort(5432, async (port) => port === 5432, []),
    ).resolves.toBe(5433);
  });

  it("wszystkie porty w limicie zajęte daje null", async () => {
    expect(FREE_PORT_SEARCH_LIMIT).toBe(100);
    await expect(
      suggestFreePort(5432, async () => true, []),
    ).resolves.toBeNull();
  });

  it("wolny port tuż za limitem nie jest brany", async () => {
    await expect(
      suggestFreePort(5432, async (port) => port !== 5533, []),
    ).resolves.toBeNull();
  });

  it("ostatni port w limicie jest brany", async () => {
    await expect(
      suggestFreePort(5432, async (port) => port !== 5532, []),
    ).resolves.toBe(5532);
  });
});

describe("portSettings", () => {
  it("zajęty port bazy daje nową zmienną i przepisany DATABASE_URL", () => {
    expect(
      portSettings({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: ENV_TEXT,
      }),
    ).toEqual([
      "DB_PORT=5433",
      "DATABASE_URL=postgresql://localhost:5433/acme_shop",
    ]);
  });

  it("przepisany DATABASE_URL zachowuje użytkownika i hasło", () => {
    const settings = portSettings({
      busy: [DB],
      free: new Map([[5432, 5433]]),
      envText: CREDENTIALED_ENV_TEXT,
    });
    expect(settings).toHaveLength(2);
    expect(settings[0]).toBe("DB_PORT=5433");
    expect(settings[1]?.startsWith("DATABASE_URL=")).toBe(true);
    expect(urlParts(settings[1]?.slice("DATABASE_URL=".length))).toEqual(
      MOVED_DEV_DATABASE,
    );
  });

  it("zajęty port SMTP przepisuje SMTP_URL", () => {
    expect(
      portSettings({
        busy: [MAIL_SMTP],
        free: new Map([[1025, 1026]]),
        envText: ENV_TEXT,
      }),
    ).toEqual(["MAILPIT_SMTP_PORT=1026", "SMTP_URL=smtp://localhost:1026"]);
  });

  it("adres 127.0.0.1 też jest przepisany", () => {
    expect(
      portSettings({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: "DATABASE_URL=postgresql://127.0.0.1:5432/db\n",
      }),
    ).toEqual(["DB_PORT=5433", "DATABASE_URL=postgresql://127.0.0.1:5433/db"]);
  });

  it("port, który tylko zaczyna się od zajętego, nie jest przepisany", () => {
    expect(
      portSettings({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText:
          "OTHER_URL=http://localhost:54320/x\nDATABASE_URL=postgresql://localhost:5432/db\n",
      }),
    ).toEqual(["DB_PORT=5433", "DATABASE_URL=postgresql://localhost:5433/db"]);
  });

  it("brak wolnego portu daje zmienną z miejscem do uzupełnienia i bez zależnych linii", () => {
    expect(
      portSettings({
        busy: [DB],
        free: new Map([[5432, null]]),
        envText: ENV_TEXT,
      }),
    ).toEqual(["DB_PORT=<free port>"]);
  });

  it("port bez zmiennej nie daje żadnej linii", () => {
    expect(
      portSettings({
        busy: [WEB],
        free: new Map([[8080, 8081]]),
        envText: ENV_TEXT,
      }),
    ).toEqual([]);
  });
});

describe("busyPortsReport", () => {
  it("opisuje zajęty port i podaje ustawienia do .env z wcięciem", () => {
    expect(
      busyPortsReport(
        [DB],
        ["DB_PORT=5433", "DATABASE_URL=postgresql://localhost:5433/acme_shop"],
      ),
    ).toEqual([
      "Port 5432 (DB_PORT, service db) is already in use, so the Docker services were not started.",
      "Set free ports in .env, then run the remaining steps below:",
      "  DB_PORT=5433",
      "  DATABASE_URL=postgresql://localhost:5433/acme_shop",
    ]);
  });

  it("port bez zmiennej podaje tylko usługę", () => {
    expect(busyPortsReport([WEB], [])[0]).toBe(
      "Port 8080 (service web) is already in use, so the Docker services were not started.",
    );
  });

  it("każdy zajęty port ma swoją linię", () => {
    const report = busyPortsReport(
      [DB, MAIL_SMTP],
      ["DB_PORT=5433", "MAILPIT_SMTP_PORT=1026"],
    );
    expect(report).toContain(
      "Port 5432 (DB_PORT, service db) is already in use, so the Docker services were not started.",
    );
    expect(report).toContain(
      "Port 1025 (MAILPIT_SMTP_PORT, service mail) is already in use, so the Docker services were not started.",
    );
    expect(report).toContain("  MAILPIT_SMTP_PORT=1026");
  });
});

const PROFILES_COMPOSE = `x-common:
  ports:
    - "7100:7100"
services:
  multi:
    image: x
    profiles: ["dev", "s3"]
    ports:
      - "7200:7200"
  open:
    image: x
    profiles: []
    ports:
      - "7300:7300"
  udp:
    image: x
    expose:
      - "7400:7400"
    ports:
      - "1025:1025/udp"
volumes:
  data:
    ports:
      - "7500:7500"
`;

describe("publishedPorts: profile, protokoły i sekcje", () => {
  it("usługa z kilkoma profilami jest włączona jednym z nich, pusta lista profili zawsze", () => {
    expect(
      publishedPorts(PROFILES_COMPOSE, { profiles: ["s3"], env: {} }),
    ).toEqual([
      { service: "multi", variable: null, port: 7200 },
      { service: "open", variable: null, port: 7300 },
      { service: "udp", variable: null, port: 1025 },
    ]);
  });

  it("bez profili usługa z profilami jest pominięta, a sekcje poza services i klucze poza ports nie liczą się", () => {
    expect(publishedPorts(PROFILES_COMPOSE, { profiles: [], env: {} })).toEqual(
      [
        { service: "open", variable: null, port: 7300 },
        { service: "udp", variable: null, port: 1025 },
      ],
    );
  });

  it("wartość zmiennej z literą na początku daje port domyślny", () => {
    expect(
      publishedPorts(KIT_COMPOSE, {
        profiles: [],
        env: { DB_PORT: "x5544" },
      })[0],
    ).toStrictEqual(DB);
  });
});

describe("portSettings: przepisywanie zależnych linii", () => {
  it("port występujący dwa razy w wartości jest przepisany w obu miejscach", () => {
    expect(
      portSettings({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: "X_URL=http://localhost:5432,127.0.0.1:5432\n",
      }),
    ).toEqual(["DB_PORT=5433", "X_URL=http://localhost:5433,127.0.0.1:5433"]);
  });

  it("zakomentowana linia nie daje ustawienia", () => {
    expect(
      portSettings({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: "# OLD_URL=http://localhost:5432\n",
      }),
    ).toEqual(["DB_PORT=5433"]);
  });
});

describe("busyPortsReport: bez ustawień", () => {
  it("port bez zmiennej i bez ustawień daje dokładnie jedną linię", () => {
    expect(
      busyPortsReport([{ service: "web", variable: null, port: 8080 }], []),
    ).toEqual([
      "Port 8080 (service web) is already in use, so the Docker services were not started.",
    ]);
  });
});

describe("publishedPorts: koniec listy ports", () => {
  it("lista expose po ports w tej samej usłudze nie dokłada portów", () => {
    const compose = `services:
  api:
    image: node
    ports:
      - "5432:5432"
    expose:
      - "9229:9229"
`;
    expect(publishedPorts(compose, { profiles: [], env: {} })).toEqual([
      { service: "api", variable: null, port: 5432 },
    ]);
  });
});

describe("portAssignments", () => {
  it("a busy database port moves to the free port and rewrites DATABASE_URL", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: ENV_TEXT,
        shellEnv: {},
      }),
    ).toStrictEqual({
      values: {
        DB_PORT: "5433",
        DATABASE_URL: "postgresql://localhost:5433/acme_shop",
      },
      unresolved: [],
    });
  });

  it("a moved DATABASE_URL keeps its user and password", () => {
    const { values, unresolved } = portAssignments({
      busy: [DB],
      free: new Map([[5432, 5433]]),
      envText: CREDENTIALED_ENV_TEXT,
      shellEnv: {},
    });
    expect(unresolved).toStrictEqual([]);
    expect(Object.keys(values)).toStrictEqual(["DB_PORT", "DATABASE_URL"]);
    expect(values.DB_PORT).toBe("5433");
    expect(urlParts(values.DATABASE_URL)).toEqual(MOVED_DEV_DATABASE);
  });

  it("a busy SMTP port moves and rewrites SMTP_URL only", () => {
    expect(
      portAssignments({
        busy: [MAIL_SMTP],
        free: new Map([[1025, 1026]]),
        envText: ENV_TEXT,
        shellEnv: {},
      }),
    ).toStrictEqual({
      values: { MAILPIT_SMTP_PORT: "1026", SMTP_URL: "smtp://localhost:1026" },
      unresolved: [],
    });
  });

  it("no busy ports gives no values and nothing unresolved", () => {
    expect(
      portAssignments({
        busy: [],
        free: new Map(),
        envText: ENV_TEXT,
        shellEnv: {},
      }),
    ).toStrictEqual({ values: {}, unresolved: [] });
  });

  it("a literal port without a variable is unresolved and writes nothing", () => {
    expect(
      portAssignments({
        busy: [WEB],
        free: new Map([[8080, 8081]]),
        envText: ENV_TEXT,
        shellEnv: {},
      }),
    ).toStrictEqual({ values: {}, unresolved: [WEB] });
  });

  it("a variable set in the shell env is unresolved and writes nothing, even its dependent URL", () => {
    const shellDb: PublishedPort = {
      service: "db",
      variable: "DB_PORT",
      port: 5544,
    };
    expect(
      portAssignments({
        busy: [shellDb],
        free: new Map([[5544, 5545]]),
        envText: "DATABASE_URL=postgresql://localhost:5544/acme_shop\n",
        shellEnv: { DB_PORT: "5544" },
      }),
    ).toStrictEqual({ values: {}, unresolved: [shellDb] });
  });

  it("a shell variable of another service does not block the move", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: ENV_TEXT,
        shellEnv: { MAILPIT_SMTP_PORT: "1025", PATH: "/usr/bin" },
      }),
    ).toStrictEqual({
      values: {
        DB_PORT: "5433",
        DATABASE_URL: "postgresql://localhost:5433/acme_shop",
      },
      unresolved: [],
    });
  });

  it("a shell key present with an undefined value counts as not set", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: ENV_TEXT,
        shellEnv: { DB_PORT: undefined },
      }).values,
    ).toStrictEqual({
      DB_PORT: "5433",
      DATABASE_URL: "postgresql://localhost:5433/acme_shop",
    });
  });

  it("a busy port without a free port is unresolved and writes nothing", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map([[5432, null]]),
        envText: ENV_TEXT,
        shellEnv: {},
      }),
    ).toStrictEqual({ values: {}, unresolved: [DB] });
  });

  it("a busy port missing from the free map is unresolved", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map(),
        envText: ENV_TEXT,
        shellEnv: {},
      }),
    ).toStrictEqual({ values: {}, unresolved: [DB] });
  });

  it("only the unmovable port is unresolved when another one moves", () => {
    expect(
      portAssignments({
        busy: [DB, MAIL_SMTP],
        free: new Map([
          [5432, 5433],
          [1025, 1026],
        ]),
        envText: ENV_TEXT,
        shellEnv: { DB_PORT: "5432" },
      }),
    ).toStrictEqual({
      values: { MAILPIT_SMTP_PORT: "1026", SMTP_URL: "smtp://localhost:1026" },
      unresolved: [DB],
    });
  });

  it("a commented line and a longer port that starts with the busy one are not rewritten", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: [
          "# DATABASE_URL=postgresql://localhost:5432/old",
          "OTHER_URL=postgresql://localhost:54321/other",
          "DATABASE_URL=postgresql://localhost:5432/acme_shop",
          "",
        ].join("\n"),
        shellEnv: {},
      }),
    ).toStrictEqual({
      values: {
        DB_PORT: "5433",
        DATABASE_URL: "postgresql://localhost:5433/acme_shop",
      },
      unresolved: [],
    });
  });

  it("an address on 127.0.0.1 is rewritten", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: "DATABASE_URL=postgresql://127.0.0.1:5432/db\n",
        shellEnv: {},
      }).values,
    ).toStrictEqual({
      DB_PORT: "5433",
      DATABASE_URL: "postgresql://127.0.0.1:5433/db",
    });
  });

  it("a value on another host with the same port is not rewritten", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: "REMOTE_URL=postgresql://db.example.com:5432/db\n",
        shellEnv: {},
      }).values,
    ).toStrictEqual({ DB_PORT: "5433" });
  });

  it("two busy ports get their own free ports and their own dependent values", () => {
    expect(
      portAssignments({
        busy: [MINIO, MINIO_CONSOLE],
        free: new Map([
          [9000, 9002],
          [9001, 9003],
        ]),
        envText:
          "S3_ENDPOINT=http://localhost:9000\nMINIO_CONSOLE_URL=http://localhost:9001\n",
        shellEnv: {},
      }),
    ).toStrictEqual({
      values: {
        MINIO_PORT: "9002",
        S3_ENDPOINT: "http://localhost:9002",
        MINIO_CONSOLE_PORT: "9003",
        MINIO_CONSOLE_URL: "http://localhost:9003",
      },
      unresolved: [],
    });
  });

  it("the free port is written, never the busy one", () => {
    const { values } = portAssignments({
      busy: [MAIL_UI],
      free: new Map([[8025, 8026]]),
      envText: "",
      shellEnv: {},
    });
    expect(values).toStrictEqual({ MAILPIT_UI_PORT: "8026" });
  });

  it("a line without = and a line with an empty key are not rewritten", () => {
    expect(
      portAssignments({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: [
          "localhost:5432",
          "=http://localhost:5432",
          "DATABASE_URL=postgresql://localhost:5432/acme_shop",
          "",
        ].join("\n"),
        shellEnv: {},
      }).values,
    ).toStrictEqual({
      DB_PORT: "5433",
      DATABASE_URL: "postgresql://localhost:5433/acme_shop",
    });
  });

  test.prop([
    fc.constantFrom<(name: string, host: string) => string>(
      (name, host) => `# ${name}=http://${host}:5432`,
      (name, host) => `${name}${host}:5432`,
      (name, host) => `=${name}${host}:5432`,
    ),
    fc.stringMatching(/^[A-Z_]{1,12}$/),
    fc.constantFrom("localhost", "127.0.0.1"),
  ])(
    "a commented line, a line without = or with an empty key never produces a key",
    (shape, name, host) => {
      const line = shape(name, host);
      expect(
        portAssignments({
          busy: [DB],
          free: new Map([[5432, 5433]]),
          envText: `${line}\n`,
          shellEnv: {},
        }).values,
      ).toStrictEqual({ DB_PORT: "5433" });
    },
  );

  test.prop([
    fc.integer({ min: 1024, max: 60000 }),
    fc.integer({ min: 1, max: 100 }),
    fc.constantFrom("localhost", "127.0.0.1"),
  ])(
    "any movable busy port writes the free port and rewrites the URL on it",
    (port, offset, host) => {
      const busy: PublishedPort = { service: "db", variable: "DB_PORT", port };
      const free = port + offset;
      expect(
        portAssignments({
          busy: [busy],
          free: new Map([[port, free]]),
          envText: `DATABASE_URL=postgresql://${host}:${port}/db\n`,
          shellEnv: {},
        }),
      ).toStrictEqual({
        values: {
          DB_PORT: `${free}`,
          DATABASE_URL: `postgresql://${host}:${free}/db`,
        },
        unresolved: [],
      });
    },
  );

  test.prop([
    fc.integer({ min: 1024, max: 60000 }),
    fc.integer({ min: 1, max: 100 }),
  ])(
    "a busy port whose variable is in the shell env is never assigned",
    (port, offset) => {
      const busy: PublishedPort = { service: "db", variable: "DB_PORT", port };
      expect(
        portAssignments({
          busy: [busy],
          free: new Map([[port, port + offset]]),
          envText: `DATABASE_URL=postgresql://localhost:${port}/db\n`,
          shellEnv: { DB_PORT: `${port}` },
        }),
      ).toStrictEqual({ values: {}, unresolved: [busy] });
    },
  );
});

const TESTS_READ_MOVED_PORTS =
  "npm run test:integration and npm run test:e2e read the moved ports from .env.";

describe("movedPortsReport", () => {
  it("a moved database port ends the report with the tests line", () => {
    const report = movedPortsReport({
      busy: [DB],
      free: new Map([[5432, 5433]]),
      envText: ENV_TEXT,
      shellEnv: {},
    });
    expect(report.at(-1)).toBe(TESTS_READ_MOVED_PORTS);
    expect(
      report.filter((line) => line === TESTS_READ_MOVED_PORTS),
    ).toHaveLength(1);
    expect(report.length).toBeGreaterThan(1);
  });

  it("two moved ports still give one tests line at the end", () => {
    const report = movedPortsReport({
      busy: [DB, MAIL_SMTP],
      free: new Map([
        [5432, 5433],
        [1025, 1026],
      ]),
      envText: ENV_TEXT,
      shellEnv: {},
    });
    expect(report.at(-1)).toBe(TESTS_READ_MOVED_PORTS);
    expect(
      report.filter((line) => line === TESTS_READ_MOVED_PORTS),
    ).toHaveLength(1);
  });

  it("no busy ports give no tests line", () => {
    expect(
      movedPortsReport({
        busy: [],
        free: new Map(),
        envText: ENV_TEXT,
        shellEnv: {},
      }),
    ).not.toContain(TESTS_READ_MOVED_PORTS);
  });

  it("a busy port that could not move gives no tests line", () => {
    expect(
      movedPortsReport({
        busy: [DB],
        free: new Map([[5432, null]]),
        envText: ENV_TEXT,
        shellEnv: {},
      }),
    ).not.toContain(TESTS_READ_MOVED_PORTS);
  });

  it("a busy port whose variable is set in the shell gives no tests line", () => {
    expect(
      movedPortsReport({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: ENV_TEXT,
        shellEnv: { DB_PORT: "5432" },
      }),
    ).not.toContain(TESTS_READ_MOVED_PORTS);
  });

  it("one moved and one unmovable port end with the tests line", () => {
    expect(
      movedPortsReport({
        busy: [DB, WEB],
        free: new Map([
          [5432, 5433],
          [8080, 8081],
        ]),
        envText: ENV_TEXT,
        shellEnv: {},
      }).at(-1),
    ).toBe(TESTS_READ_MOVED_PORTS);
  });
});
