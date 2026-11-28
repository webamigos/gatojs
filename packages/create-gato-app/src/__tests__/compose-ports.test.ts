import { describe, expect, it } from "vitest";
import {
  busyPortsReport,
  FREE_PORT_SEARCH_LIMIT,
  portSettings,
  publishedPorts,
  suggestFreePort,
  type PublishedPort,
} from "../compose-ports.js";
import { KIT_COMPOSE } from "./kit-fixture.js";

const DB: PublishedPort = { service: "db", variable: "DB_PORT", port: 5432 };
const MAIL_UI: PublishedPort = { service: "mail", variable: "MAILPIT_UI_PORT", port: 8025 };
const MAIL_SMTP: PublishedPort = { service: "mail", variable: "MAILPIT_SMTP_PORT", port: 1025 };
const MINIO: PublishedPort = { service: "minio", variable: "MINIO_PORT", port: 9000 };
const MINIO_CONSOLE: PublishedPort = { service: "minio", variable: "MINIO_CONSOLE_PORT", port: 9001 };
const WEB: PublishedPort = { service: "web", variable: null, port: 8080 };

const ENV_TEXT =
  "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/acme_shop\nSMTP_URL=smtp://localhost:1025\n";

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
    expect(publishedPorts(KIT_COMPOSE, { profiles: [], env: {} })).toStrictEqual([DB, MAIL_UI, MAIL_SMTP]);
  });

  it("profil s3 dokłada porty minio, a minio-init nic nie publikuje", () => {
    expect(publishedPorts(KIT_COMPOSE, { profiles: ["s3"], env: {} })).toStrictEqual([
      DB,
      MAIL_UI,
      MAIL_SMTP,
      MINIO,
      MINIO_CONSOLE,
    ]);
  });

  it("inny profil nie włącza usług z profilem s3", () => {
    expect(publishedPorts(KIT_COMPOSE, { profiles: ["other"], env: {} })).toStrictEqual([DB, MAIL_UI, MAIL_SMTP]);
  });

  it("zmienna środowiskowa nadpisuje domyślny port", () => {
    expect(publishedPorts(KIT_COMPOSE, { profiles: [], env: { DB_PORT: "5544" } })).toStrictEqual([
      { service: "db", variable: "DB_PORT", port: 5544 },
      MAIL_UI,
      MAIL_SMTP,
    ]);
  });

  it("nadpisanie portu minio działa tylko z profilem", () => {
    expect(
      publishedPorts(KIT_COMPOSE, { profiles: ["s3"], env: { MINIO_CONSOLE_PORT: "9101" } }),
    ).toContainEqual({ service: "minio", variable: "MINIO_CONSOLE_PORT", port: 9101 });
  });

  it.each([["abc"], [""], ["12ab"]])("niepoprawna wartość %j daje port domyślny", (value) => {
    expect(publishedPorts(KIT_COMPOSE, { profiles: [], env: { DB_PORT: value } })[0]).toStrictEqual(DB);
  });

  it("dosłowne mapowanie ma port bez zmiennej, sam port kontenera nic nie publikuje, niecytowana zmienna działa", () => {
    expect(publishedPorts(CUSTOM_COMPOSE, { profiles: [], env: {} })).toStrictEqual([
      WEB,
      { service: "web", variable: "X_PORT", port: 7000 },
    ]);
  });
});

describe("suggestFreePort", () => {
  it("pomija zajęte i już przydzielone porty", async () => {
    await expect(suggestFreePort(5432, async (port) => port === 5433, [5434])).resolves.toBe(5435);
  });

  it("nigdy nie zwraca zajętego portu wyjściowego", async () => {
    await expect(suggestFreePort(5432, async (port) => port === 5432, [])).resolves.toBe(5433);
  });

  it("wszystkie porty w limicie zajęte daje null", async () => {
    expect(FREE_PORT_SEARCH_LIMIT).toBe(100);
    await expect(suggestFreePort(5432, async () => true, [])).resolves.toBeNull();
  });

  it("wolny port tuż za limitem nie jest brany", async () => {
    await expect(suggestFreePort(5432, async (port) => port !== 5533, [])).resolves.toBeNull();
  });

  it("ostatni port w limicie jest brany", async () => {
    await expect(suggestFreePort(5432, async (port) => port !== 5532, [])).resolves.toBe(5532);
  });
});

describe("portSettings", () => {
  it("zajęty port bazy daje nową zmienną i przepisany DATABASE_URL", () => {
    expect(portSettings({ busy: [DB], free: new Map([[5432, 5433]]), envText: ENV_TEXT })).toEqual([
      "DB_PORT=5433",
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5433/acme_shop",
    ]);
  });

  it("zajęty port SMTP przepisuje SMTP_URL", () => {
    expect(portSettings({ busy: [MAIL_SMTP], free: new Map([[1025, 1026]]), envText: ENV_TEXT })).toEqual([
      "MAILPIT_SMTP_PORT=1026",
      "SMTP_URL=smtp://localhost:1026",
    ]);
  });

  it("adres 127.0.0.1 też jest przepisany", () => {
    expect(
      portSettings({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: "DATABASE_URL=postgresql://u:p@127.0.0.1:5432/db\n",
      }),
    ).toEqual(["DB_PORT=5433", "DATABASE_URL=postgresql://u:p@127.0.0.1:5433/db"]);
  });

  it("port, który tylko zaczyna się od zajętego, nie jest przepisany", () => {
    expect(
      portSettings({
        busy: [DB],
        free: new Map([[5432, 5433]]),
        envText: "OTHER_URL=http://localhost:54320/x\nDATABASE_URL=postgresql://u:p@localhost:5432/db\n",
      }),
    ).toEqual(["DB_PORT=5433", "DATABASE_URL=postgresql://u:p@localhost:5433/db"]);
  });

  it("brak wolnego portu daje zmienną z miejscem do uzupełnienia i bez zależnych linii", () => {
    expect(portSettings({ busy: [DB], free: new Map([[5432, null]]), envText: ENV_TEXT })).toEqual([
      "DB_PORT=<free port>",
    ]);
  });

  it("port bez zmiennej nie daje żadnej linii", () => {
    expect(portSettings({ busy: [WEB], free: new Map([[8080, 8081]]), envText: ENV_TEXT })).toEqual([]);
  });
});

describe("busyPortsReport", () => {
  it("opisuje zajęty port i podaje ustawienia do .env z wcięciem", () => {
    expect(
      busyPortsReport([DB], ["DB_PORT=5433", "DATABASE_URL=postgresql://postgres:postgres@localhost:5433/acme_shop"]),
    ).toEqual([
      "Port 5432 (DB_PORT, service db) is already in use, so the Docker services were not started.",
      "Set free ports in .env, then run the remaining steps below:",
      "  DB_PORT=5433",
      "  DATABASE_URL=postgresql://postgres:postgres@localhost:5433/acme_shop",
    ]);
  });

  it("port bez zmiennej podaje tylko usługę", () => {
    expect(busyPortsReport([WEB], [])[0]).toBe(
      "Port 8080 (service web) is already in use, so the Docker services were not started.",
    );
  });

  it("każdy zajęty port ma swoją linię", () => {
    const report = busyPortsReport([DB, MAIL_SMTP], ["DB_PORT=5433", "MAILPIT_SMTP_PORT=1026"]);
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
    expect(publishedPorts(PROFILES_COMPOSE, { profiles: ["s3"], env: {} })).toEqual([
      { service: "multi", variable: null, port: 7200 },
      { service: "open", variable: null, port: 7300 },
      { service: "udp", variable: null, port: 1025 },
    ]);
  });

  it("bez profili usługa z profilami jest pominięta, a sekcje poza services i klucze poza ports nie liczą się", () => {
    expect(publishedPorts(PROFILES_COMPOSE, { profiles: [], env: {} })).toEqual([
      { service: "open", variable: null, port: 7300 },
      { service: "udp", variable: null, port: 1025 },
    ]);
  });

  it("wartość zmiennej z literą na początku daje port domyślny", () => {
    expect(publishedPorts(KIT_COMPOSE, { profiles: [], env: { DB_PORT: "x5544" } })[0]).toStrictEqual(DB);
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
    expect(busyPortsReport([{ service: "web", variable: null, port: 8080 }], [])).toEqual([
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
