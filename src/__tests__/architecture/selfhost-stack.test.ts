// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { parseDotenv } from "../../../scripts/lib/architecture/dotenv";
import {
  checkSelfhostCompose,
  checkSelfhostEnvExample,
} from "../../../scripts/lib/architecture/selfhost";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const COMPOSE_FILE = "docker-compose.selfhost.yml";
const ENV_FILE = ".env.selfhost.example";

const MAIL_PROVIDER_ISSUE =
  ".env.selfhost.example: MAIL_PROVIDER: no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail";

interface KitState {
  modules: Record<
    string,
    { manifest?: { env?: { name: string; generate?: string }[] } }
  >;
}

function readKitState(): KitState {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, ".wa/kit.json"), "utf8"),
  ) as KitState;
}

function isModuleInstalled(name: string): boolean {
  return name in readKitState().modules;
}

type ComposeService = Record<string, unknown>;
type Compose = { services: Record<string, ComposeService> } & Record<
  string,
  unknown
>;

function validCompose(): Compose {
  return {
    services: {
      db: {
        image: "postgres:16",
        healthcheck: {
          test: ["CMD-SHELL", "pg_isready -U postgres"],
          interval: "5s",
        },
      },
      migrate: {
        build: ".",
        image: "wa-app:local",
        depends_on: { db: { condition: "service_healthy" } },
        restart: "no",
      },
      app: {
        build: ".",
        image: "wa-app:local",
        depends_on: {
          migrate: { condition: "service_completed_successfully" },
        },
        healthcheck: {
          test: [
            "CMD",
            "wget",
            "-q",
            "-O",
            "/dev/null",
            "http://127.0.0.1:3000/api/healthcheck",
          ],
        },
        ports: ["3000:3000"],
      },
    },
    volumes: { "postgres-data": {}, uploads: {} },
  };
}

function regionOf(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return text.slice(from + start.length, to);
}

function linesOf(text: string): string[] {
  return text.split("\n").map((line) => line.trim());
}

describe("checkSelfhostCompose", () => {
  let root: string;

  const writeCompose = (compose: unknown) => {
    fs.writeFileSync(path.join(root, COMPOSE_FILE), stringify(compose));
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "selfhost-compose-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns no issues for a stack that waits for migrate and a healthy db", () => {
    writeCompose(validCompose());
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  const handWrittenLines = [
    "services:",
    "  db:",
    "    image: postgres:16",
    "    healthcheck:",
    '      test: ["CMD-SHELL", "pg_isready -U postgres"]',
    "  migrate:",
    "    build: .",
    "    depends_on:",
    "      db:",
    "        condition: service_healthy",
    "  app:",
    "    build: .",
    "    depends_on:",
    "      migrate:",
    "        condition: service_completed_successfully",
    "    healthcheck:",
    '      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/api/healthcheck"]',
    "",
  ];

  const writeHandWritten = (lines: string[]) => {
    fs.writeFileSync(path.join(root, COMPOSE_FILE), lines.join("\n"));
  };

  it("reads YAML written by hand with the healthcheck as a flow array", () => {
    writeHandWritten(handWrittenLines);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("reports app without depends_on", () => {
    const compose = validCompose();
    delete compose.services.app.depends_on;
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app must wait for migrate to complete (service_completed_successfully)",
    ]);
  });

  it("reports app whose depends_on key has no value", () => {
    writeHandWritten([
      ...handWrittenLines.slice(0, 12),
      "    depends_on:",
      ...handWrittenLines.slice(15),
    ]);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app must wait for migrate to complete (service_completed_successfully)",
    ]);
  });

  it("reports app whose depends_on is a bare service name", () => {
    const compose = validCompose();
    compose.services.app.depends_on = "migrate";
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app must wait for migrate to complete (service_completed_successfully)",
    ]);
  });

  it("reports migrate without depends_on", () => {
    const compose = validCompose();
    delete compose.services.migrate.depends_on;
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: migrate must wait for a healthy db (service_healthy)",
    ]);
  });

  it("reports app when it only waits for migrate to start", () => {
    const compose = validCompose();
    compose.services.app.depends_on = {
      migrate: { condition: "service_started" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app must wait for migrate to complete (service_completed_successfully)",
    ]);
  });

  it("reports app when depends_on lists migrate without a condition", () => {
    const compose = validCompose();
    compose.services.app.depends_on = ["migrate"];
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app must wait for migrate to complete (service_completed_successfully)",
    ]);
  });

  it("reports app when it waits for a healthy migrate instead of a completed one", () => {
    const compose = validCompose();
    compose.services.app.depends_on = {
      migrate: { condition: "service_healthy" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app must wait for migrate to complete (service_completed_successfully)",
    ]);
  });

  it("reports migrate when it only waits for db to start", () => {
    const compose = validCompose();
    compose.services.migrate.depends_on = {
      db: { condition: "service_started" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: migrate must wait for a healthy db (service_healthy)",
    ]);
  });

  it("reports migrate when depends_on lists db without a condition", () => {
    const compose = validCompose();
    compose.services.migrate.depends_on = ["db"];
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: migrate must wait for a healthy db (service_healthy)",
    ]);
  });

  it("reports migrate when it waits for a completed db instead of a healthy one", () => {
    const compose = validCompose();
    compose.services.migrate.depends_on = {
      db: { condition: "service_completed_successfully" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: migrate must wait for a healthy db (service_healthy)",
    ]);
  });

  it("reports app without a healthcheck", () => {
    const compose = validCompose();
    delete compose.services.app.healthcheck;
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app needs a healthcheck on /api/healthcheck",
    ]);
  });

  it("reports app with a healthcheck on another path", () => {
    const compose = validCompose();
    compose.services.app.healthcheck = {
      test: [
        "CMD",
        "wget",
        "-q",
        "-O",
        "/dev/null",
        "http://127.0.0.1:3000/health",
      ],
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app needs a healthcheck on /api/healthcheck",
    ]);
  });

  it("accepts the app healthcheck test written as a single string", () => {
    const compose = validCompose();
    compose.services.app.healthcheck = {
      test: "wget -q -O /dev/null http://127.0.0.1:3000/api/healthcheck",
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("does not accept a healthcheck on /api/healthcheck declared on db instead of app", () => {
    const compose = validCompose();
    delete compose.services.app.healthcheck;
    compose.services.db.healthcheck = {
      test: ["CMD", "wget", "http://127.0.0.1:3000/api/healthcheck"],
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app needs a healthcheck on /api/healthcheck",
    ]);
  });

  it("reports db that publishes a port", () => {
    const compose = validCompose();
    compose.services.db.ports = ["5432:5432"];
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: db must not publish a port",
    ]);
  });

  it("accepts db whose ports key has no value", () => {
    writeHandWritten([
      ...handWrittenLines.slice(0, 3),
      "    ports:",
      ...handWrittenLines.slice(3),
    ]);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("accepts db with an empty ports list", () => {
    const compose = validCompose();
    compose.services.db.ports = [];
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("does not report ports published by app", () => {
    const compose = validCompose();
    compose.services.app.ports = ["8080:3000"];
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("reports a mail service on axllent/mailpit by its service name", () => {
    const compose = validCompose();
    compose.services.mail = { image: "axllent/mailpit" };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: no mail relay in the self-hosted stack (mail)",
    ]);
  });

  it("reports a tagged axllent/mailpit image too", () => {
    const compose = validCompose();
    compose.services.relay = { image: "axllent/mailpit:v1.20" };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: no mail relay in the self-hosted stack (relay)",
    ]);
  });

  it("reports every mailpit service in file order", () => {
    const compose = validCompose();
    compose.services.zmail = { image: "axllent/mailpit:v1.20" };
    compose.services.amail = { image: "axllent/mailpit" };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: no mail relay in the self-hosted stack (zmail)",
      "docker-compose.selfhost.yml: no mail relay in the self-hosted stack (amail)",
    ]);
  });

  it("does not report services on other images", () => {
    const compose = validCompose();
    compose.services.minio = { image: "minio/minio" };
    compose.services.builder = { build: "." };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  const oneShotIssue = (name: string) =>
    `docker-compose.selfhost.yml: ${name} runs once (restart: "no"), so another service must wait for it to complete (service_completed_successfully) or up --wait fails`;

  it("reports a one-shot service that no service waits for", () => {
    const compose = validCompose();
    compose.services["minio-init"] = { image: "amazon/aws-cli", restart: "no" };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([oneShotIssue("minio-init")]);
  });

  it("reports a one-shot service that another service only waits to start", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no" };
    compose.services.app.depends_on = {
      migrate: { condition: "service_completed_successfully" },
      seed: { condition: "service_started" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([oneShotIssue("seed")]);
  });

  it("accepts a one-shot service that another service waits to complete", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no" };
    compose.services.app.depends_on = {
      migrate: { condition: "service_completed_successfully" },
      seed: { condition: "service_completed_successfully" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("accepts a one-shot service behind the tools profile", () => {
    const compose = validCompose();
    compose.services.tools = {
      build: { context: ".", target: "builder" },
      profiles: ["tools"],
      restart: "no",
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("does not report a long-running service that no service waits for", () => {
    const compose = validCompose();
    compose.services["minio-init"] = {
      image: "amazon/aws-cli",
      restart: "unless-stopped",
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  const oneShotProfileIssue = (name: string, profile: string) =>
    `docker-compose.selfhost.yml: ${name} runs once (restart: "no"), so a service started with profile ${profile} must wait for it to complete (service_completed_successfully) or up --wait fails`;

  const publishedPortIssue = (name: string) =>
    `docker-compose.selfhost.yml: ${name} must not publish a port`;

  const credentialIssue = (name: string) =>
    `docker-compose.selfhost.yml: ${name} uses the development credential minioadmin; take the credentials from .env.selfhost`;

  it("accepts a one-shot service without profiles that app waits to complete", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no" };
    compose.services.app.depends_on = {
      migrate: { condition: "service_completed_successfully" },
      seed: { condition: "service_completed_successfully" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("reports a one-shot service without profiles whose only waiter runs under a profile", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no" };
    compose.services.worker = {
      image: "w",
      profiles: ["s3"],
      depends_on: { seed: { condition: "service_completed_successfully" } },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([oneShotIssue("seed")]);
  });

  it("reports a one-shot service with an empty profiles list like one without profiles", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no", profiles: [] };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([oneShotIssue("seed")]);
  });

  it("accepts a one-shot service under a profile that a waiter under the same profile waits to complete", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no", profiles: ["s3"] };
    compose.services.worker = {
      image: "w",
      profiles: ["s3"],
      depends_on: { seed: { condition: "service_completed_successfully" } },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("accepts a one-shot service under a profile that app without profiles waits to complete", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no", profiles: ["s3"] };
    compose.services.app.depends_on = {
      migrate: { condition: "service_completed_successfully" },
      seed: { condition: "service_completed_successfully" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("reports the profile of a one-shot service that no waiter runs under", () => {
    const compose = validCompose();
    compose.services.seed = {
      image: "x",
      restart: "no",
      profiles: ["s3", "full"],
    };
    compose.services.worker = {
      image: "w",
      profiles: ["s3"],
      depends_on: { seed: { condition: "service_completed_successfully" } },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      oneShotProfileIssue("seed", "full"),
    ]);
  });

  it("accepts a one-shot service with two profiles covered by a different waiter for each", () => {
    const compose = validCompose();
    compose.services.seed = {
      image: "x",
      restart: "no",
      profiles: ["s3", "full"],
    };
    compose.services.w1 = {
      image: "w",
      profiles: ["s3"],
      depends_on: { seed: { condition: "service_completed_successfully" } },
    };
    compose.services.w2 = {
      image: "w",
      profiles: ["full"],
      depends_on: { seed: { condition: "service_completed_successfully" } },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("reports every uncovered profile in the one-shot service's profile order", () => {
    const compose = validCompose();
    compose.services.seed = {
      image: "x",
      restart: "no",
      profiles: ["s3", "full"],
    };
    compose.services.worker = {
      image: "w",
      profiles: ["other"],
      depends_on: { seed: { condition: "service_completed_successfully" } },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      oneShotProfileIssue("seed", "s3"),
      oneShotProfileIssue("seed", "full"),
    ]);
  });

  it("reports a one-shot service under a profile that no service waits for", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no", profiles: ["s3"] };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      oneShotProfileIssue("seed", "s3"),
    ]);
  });

  it("counts a waiter with an empty profiles list as always running", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no" };
    compose.services.worker = {
      image: "w",
      profiles: [],
      depends_on: { seed: { condition: "service_completed_successfully" } },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("counts a waiter whose profiles is not a list as always running", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no" };
    compose.services.worker = {
      image: "w",
      profiles: "s3",
      depends_on: { seed: { condition: "service_completed_successfully" } },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("does not count a waiter under the right profile that only waits for the one-shot service to start", () => {
    const compose = validCompose();
    compose.services.seed = { image: "x", restart: "no", profiles: ["s3"] };
    compose.services.worker = {
      image: "w",
      profiles: ["s3"],
      depends_on: { seed: { condition: "service_started" } },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      oneShotProfileIssue("seed", "s3"),
    ]);
  });

  it("reports minio that publishes a port", () => {
    const compose = validCompose();
    compose.services.minio = { image: "minio/minio", ports: ["9000:9000"] };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([publishedPortIssue("minio")]);
  });

  it("reports migrate that publishes a port", () => {
    const compose = validCompose();
    compose.services.migrate.ports = ["5555:5555"];
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([publishedPortIssue("migrate")]);
  });

  it("accepts a service other than db with an empty ports list", () => {
    const compose = validCompose();
    compose.services.minio = { image: "minio/minio", ports: [] };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("accepts a service other than db whose ports key has no value", () => {
    const compose = validCompose();
    compose.services.minio = { image: "minio/minio", ports: null };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("reports every service that publishes a port once, in file order", () => {
    const compose = validCompose();
    compose.services.migrate.ports = ["5555:5555"];
    compose.services.zstore = { image: "z", ports: ["9001:9001", "9002:9002"] };
    compose.services.astore = { image: "a", ports: ["9003:9003"] };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      publishedPortIssue("migrate"),
      publishedPortIssue("zstore"),
      publishedPortIssue("astore"),
    ]);
  });

  it("reports the minioadmin credential once per service in a map environment", () => {
    const compose = validCompose();
    compose.services.minio = {
      image: "minio/minio",
      environment: {
        MINIO_ROOT_USER: "minioadmin",
        MINIO_ROOT_PASSWORD: "minioadmin",
      },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([credentialIssue("minio")]);
  });

  it("reports the minioadmin credential in a list environment", () => {
    const compose = validCompose();
    compose.services.minio = {
      image: "minio/minio",
      environment: ["MINIO_ROOT_USER=minioadmin"],
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([credentialIssue("minio")]);
  });

  it("reports the minioadmin credential as an interpolation default", () => {
    const compose = validCompose();
    compose.services.minio = {
      image: "minio/minio",
      environment: { MINIO_ROOT_USER: "${S3_ACCESS_KEY_ID:-minioadmin}" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([credentialIssue("minio")]);
  });

  it("reports the minioadmin credential in a command string", () => {
    const compose = validCompose();
    compose.services["minio-init"] = {
      image: "minio/mc",
      command: "mc alias set local http://minio:9000 minioadmin minioadmin",
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([credentialIssue("minio-init")]);
  });

  it("reports the minioadmin credential in an entrypoint string", () => {
    const compose = validCompose();
    compose.services["minio-init"] = {
      image: "minio/mc",
      entrypoint:
        "/bin/sh -c 'mc alias set local http://minio:9000 minioadmin secret'",
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([credentialIssue("minio-init")]);
  });

  it("reports the minioadmin credential written in mixed case", () => {
    const compose = validCompose();
    compose.services.minio = {
      image: "minio/minio",
      environment: { MINIO_ROOT_USER: "MinioAdmin" },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([credentialIssue("minio")]);
  });

  it("accepts credentials taken from the environment without a default", () => {
    const compose = validCompose();
    compose.services.minio = {
      image: "minio/minio",
      environment: {
        MINIO_ROOT_USER: "${S3_ACCESS_KEY_ID}",
        MINIO_ROOT_PASSWORD: "${S3_SECRET_ACCESS_KEY}",
      },
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([]);
  });

  it("reports every service with the minioadmin credential in file order", () => {
    const compose = validCompose();
    compose.services.zstore = {
      image: "z",
      environment: { USER: "minioadmin" },
    };
    compose.services.astore = {
      image: "a",
      command: "start --user minioadmin",
    };
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      credentialIssue("zstore"),
      credentialIssue("astore"),
    ]);
  });

  it("reports every broken rule in the contract order", () => {
    const compose = validCompose();
    compose.services.minio = {
      image: "minio/minio",
      ports: ["9000:9000"],
      environment: { MINIO_ROOT_USER: "minioadmin" },
    };
    compose.services.mail = { image: "axllent/mailpit" };
    compose.services.seed = { image: "x", restart: "no" };
    compose.services.app.depends_on = {
      migrate: { condition: "service_started" },
    };
    compose.services.migrate.depends_on = ["db"];
    delete compose.services.app.healthcheck;
    compose.services.db.ports = ["5432:5432"];
    writeCompose(compose);
    expect(checkSelfhostCompose(root)).toEqual([
      "docker-compose.selfhost.yml: app must wait for migrate to complete (service_completed_successfully)",
      "docker-compose.selfhost.yml: migrate must wait for a healthy db (service_healthy)",
      "docker-compose.selfhost.yml: app needs a healthcheck on /api/healthcheck",
      "docker-compose.selfhost.yml: db must not publish a port",
      "docker-compose.selfhost.yml: minio must not publish a port",
      "docker-compose.selfhost.yml: no mail relay in the self-hosted stack (mail)",
      `docker-compose.selfhost.yml: seed runs once (restart: "no"), so another service must wait for it to complete (service_completed_successfully) or up --wait fails`,
      "docker-compose.selfhost.yml: minio uses the development credential minioadmin; take the credentials from .env.selfhost",
    ]);
  });
});

describe("checkSelfhostEnvExample", () => {
  let root: string;

  const coreLines = [
    "APP_URL=https://app.example.com",
    "BETTER_AUTH_SECRET=",
    "POSTGRES_PASSWORD=",
    'EMAIL_FROM="WA App <noreply@example.com>"',
    "MAIL_PROVIDER=smtp",
    "# SMTP_HOST=",
    "# SMTP_PORT=587",
    "# SMTP_USER=",
    "# SMTP_PASS=",
    "AUTH_PUBLIC_SIGNUP=false",
    "MULTI_ORG=false",
    "LOG_LEVEL=info",
    "OTEL_EXPORTER_OTLP_ENDPOINT=",
  ];

  const moduleLines = [
    ...(isModuleInstalled("api-keys") ? ["API_KEY_PEPPER="] : []),
    ...(isModuleInstalled("encryption")
      ? ["ENCRYPTION_PROVIDER=local", "ENCRYPTION_MASTER_KEY="]
      : []),
    ...(isModuleInstalled("uploads")
      ? [
          "STORAGE_PROVIDER=local",
          "STORAGE_LOCAL_PATH=/app/volumes/uploads",
          "S3_ENDPOINT=http://minio:9000",
          "S3_REGION=us-east-1",
          "S3_ACCESS_KEY_ID=",
          "S3_SECRET_ACCESS_KEY=",
          "S3_SESSION_TOKEN=",
          "S3_BUCKET=wa-app-uploads",
          "S3_FORCE_PATH_STYLE=true",
        ]
      : []),
  ];

  const baseLines = [
    ...coreLines,
    "# wa:modules:start",
    ...moduleLines,
    "# wa:modules:end",
  ];

  const without = (lines: string[], name: string) =>
    lines.filter((line) => !line.startsWith(`${name}=`));

  const replaced = (lines: string[], name: string, line: string) =>
    lines.map((current) => (current.startsWith(`${name}=`) ? line : current));

  const writeEnv = (lines: string[]) => {
    fs.writeFileSync(path.join(root, ENV_FILE), `${lines.join("\n")}\n`);
  };

  const writeKitState = (state: KitState) => {
    fs.mkdirSync(path.join(root, ".wa"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".wa/kit.json"),
      JSON.stringify(state, null, 2),
    );
  };

  const removeKitState = () => {
    fs.rmSync(path.join(root, ".wa"), { recursive: true, force: true });
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "selfhost-env-"));
    writeKitState(readKitState());
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("passes production validation with operator values filled in", () => {
    writeEnv(baseLines);
    expect(checkSelfhostEnvExample(root)).toEqual([]);
  });

  it("reports the production mail issue when the MAIL_PROVIDER line is missing", () => {
    writeEnv(without(baseLines, "MAIL_PROVIDER"));
    expect(checkSelfhostEnvExample(root)).toEqual([MAIL_PROVIDER_ISSUE]);
  });

  it("reports the production mail issue when MAIL_PROVIDER is blank", () => {
    writeEnv(replaced(baseLines, "MAIL_PROVIDER", "MAIL_PROVIDER="));
    expect(checkSelfhostEnvExample(root)).toEqual([MAIL_PROVIDER_ISSUE]);
  });

  it("does not fill SMTP_HOST for MAIL_PROVIDER=console", () => {
    writeEnv(replaced(baseLines, "MAIL_PROVIDER", "MAIL_PROVIDER=console"));
    expect(checkSelfhostEnvExample(root)).toEqual([]);
  });

  it("keeps a configured SMTP_HOST next to MAIL_PROVIDER=smtp", () => {
    writeEnv([...baseLines, "SMTP_HOST=mail.corp"]);
    expect(checkSelfhostEnvExample(root)).toEqual([]);
  });

  it("fills a blank SMTP_HOST line when MAIL_PROVIDER=smtp", () => {
    writeEnv([...baseLines, "SMTP_HOST="]);
    expect(checkSelfhostEnvExample(root)).toEqual([]);
  });

  it("keeps a non-empty BETTER_AUTH_SECRET instead of filling it", () => {
    writeEnv(
      replaced(baseLines, "BETTER_AUTH_SECRET", "BETTER_AUTH_SECRET=short"),
    );
    expect(checkSelfhostEnvExample(root)).toEqual([
      expect.stringMatching(/^\.env\.selfhost\.example: BETTER_AUTH_SECRET: /),
    ]);
  });

  it("treats a whitespace-only BETTER_AUTH_SECRET as blank and fills it", () => {
    writeEnv(
      replaced(baseLines, "BETTER_AUTH_SECRET", 'BETTER_AUTH_SECRET="   "'),
    );
    expect(checkSelfhostEnvExample(root)).toEqual([]);
  });

  it("fills BETTER_AUTH_SECRET when its line is missing", () => {
    writeEnv(without(baseLines, "BETTER_AUTH_SECRET"));
    expect(checkSelfhostEnvExample(root)).toEqual([]);
  });

  it("forces NODE_ENV=production over the file value", () => {
    writeEnv([...without(baseLines, "MAIL_PROVIDER"), "NODE_ENV=development"]);
    expect(checkSelfhostEnvExample(root)).toEqual([MAIL_PROVIDER_ISSUE]);
  });

  it("forces NODE_ENV=production over an invalid file value", () => {
    writeEnv([...baseLines, "NODE_ENV=staging"]);
    expect(checkSelfhostEnvExample(root)).toEqual([]);
  });

  it("sets DATABASE_URL as compose does, over a blank file value", () => {
    writeEnv([...baseLines, "DATABASE_URL="]);
    expect(checkSelfhostEnvExample(root)).toEqual([]);
  });

  it.skipIf(!isModuleInstalled("api-keys"))(
    "fills the secret-32 API_KEY_PEPPER only from the kit state: without .wa/kit.json it is reported",
    () => {
      removeKitState();
      writeEnv(baseLines);
      expect(checkSelfhostEnvExample(root)).toContainEqual(
        expect.stringMatching(/^\.env\.selfhost\.example: API_KEY_PEPPER: \S/),
      );
    },
  );

  it.skipIf(!isModuleInstalled("api-keys"))(
    "keeps a non-empty API_KEY_PEPPER instead of filling it",
    () => {
      writeEnv(replaced(baseLines, "API_KEY_PEPPER", "API_KEY_PEPPER=short"));
      expect(checkSelfhostEnvExample(root)).toEqual([
        expect.stringMatching(/^\.env\.selfhost\.example: API_KEY_PEPPER: \S/),
      ]);
    },
  );

  it.skipIf(!isModuleInstalled("api-keys"))(
    "fills API_KEY_PEPPER when its line is missing",
    () => {
      writeEnv(without(baseLines, "API_KEY_PEPPER"));
      expect(checkSelfhostEnvExample(root)).toEqual([]);
    },
  );

  it.skipIf(!isModuleInstalled("encryption"))(
    "fills the hex-32 ENCRYPTION_MASTER_KEY with a valid master key",
    () => {
      writeEnv(baseLines);
      expect(checkSelfhostEnvExample(root)).toEqual([]);
    },
  );

  it.skipIf(!isModuleInstalled("encryption"))(
    "does not fill ENCRYPTION_MASTER_KEY without .wa/kit.json",
    () => {
      removeKitState();
      writeEnv(baseLines);
      expect(checkSelfhostEnvExample(root)).toContainEqual(
        expect.stringMatching(
          /^\.env\.selfhost\.example: ENCRYPTION_MASTER_KEY: \S/,
        ),
      );
    },
  );

  it.skipIf(!isModuleInstalled("encryption"))(
    "keeps a non-empty ENCRYPTION_MASTER_KEY instead of filling it",
    () => {
      writeEnv(
        replaced(
          baseLines,
          "ENCRYPTION_MASTER_KEY",
          "ENCRYPTION_MASTER_KEY=not-hex",
        ),
      );
      expect(checkSelfhostEnvExample(root)).toEqual([
        expect.stringMatching(
          /^\.env\.selfhost\.example: ENCRYPTION_MASTER_KEY: \S/,
        ),
      ]);
    },
  );

  it.skipIf(!isModuleInstalled("encryption"))(
    "fills secret-64 with 64 non-hex characters, which a master key rejects",
    () => {
      const state = readKitState();
      const entry = state.modules.encryption.manifest?.env?.find(
        ({ name }) => name === "ENCRYPTION_MASTER_KEY",
      );
      expect(entry).toBeDefined();
      if (entry) {
        entry.generate = "secret-64";
      }
      writeKitState(state);
      writeEnv(baseLines);
      expect(checkSelfhostEnvExample(root)).toEqual([
        expect.stringMatching(
          /^\.env\.selfhost\.example: ENCRYPTION_MASTER_KEY: \S/,
        ),
      ]);
    },
  );

  it.skipIf(!isModuleInstalled("encryption"))(
    "fills secret-32 with 32 non-hex characters, which a master key rejects",
    () => {
      const state = readKitState();
      const entry = state.modules.encryption.manifest?.env?.find(
        ({ name }) => name === "ENCRYPTION_MASTER_KEY",
      );
      expect(entry).toBeDefined();
      if (entry) {
        entry.generate = "secret-32";
      }
      writeKitState(state);
      writeEnv(baseLines);
      expect(checkSelfhostEnvExample(root)).toEqual([
        expect.stringMatching(
          /^\.env\.selfhost\.example: ENCRYPTION_MASTER_KEY: \S/,
        ),
      ]);
    },
  );

  it.skipIf(!isModuleInstalled("api-keys"))(
    "fills a secret-64 module variable with a value long enough for the pepper",
    () => {
      const state = readKitState();
      const entry = state.modules["api-keys"].manifest?.env?.find(
        ({ name }) => name === "API_KEY_PEPPER",
      );
      expect(entry).toBeDefined();
      if (entry) {
        entry.generate = "secret-64";
      }
      writeKitState(state);
      writeEnv(baseLines);
      expect(checkSelfhostEnvExample(root)).toEqual([]);
    },
  );

  it.skipIf(!isModuleInstalled("api-keys"))(
    "fills a module variable by the kind its own manifest entry declares, not by module",
    () => {
      const state = readKitState();
      const entry = state.modules["api-keys"].manifest?.env?.find(
        ({ name }) => name === "API_KEY_PEPPER",
      );
      expect(entry).toBeDefined();
      if (entry) {
        delete entry.generate;
      }
      writeKitState(state);
      writeEnv(baseLines);
      expect(checkSelfhostEnvExample(root)).toEqual([
        expect.stringMatching(/^\.env\.selfhost\.example: API_KEY_PEPPER: \S/),
      ]);
    },
  );

  it.skipIf(!isModuleInstalled("uploads"))(
    "reports a relative STORAGE_LOCAL_PATH, which production rejects",
    () => {
      writeEnv(
        replaced(
          baseLines,
          "STORAGE_LOCAL_PATH",
          "STORAGE_LOCAL_PATH=./volumes/uploads",
        ),
      );
      expect(checkSelfhostEnvExample(root)).toEqual([
        expect.stringMatching(
          /^\.env\.selfhost\.example: STORAGE_LOCAL_PATH: \S/,
        ),
      ]);
    },
  );
});

describe("self-hosted stack in the repository", () => {
  it("docker-compose.selfhost.yml passes the compose checks", () => {
    expect(checkSelfhostCompose(repoRoot)).toEqual([]);
  });

  it(".env.selfhost.example passes production validation with the module registry", () => {
    expect(checkSelfhostEnvExample(repoRoot)).toEqual([]);
  });

  describe(".env.selfhost.example", () => {
    const readEnvExample = () =>
      fs.readFileSync(path.join(repoRoot, ENV_FILE), "utf8");

    const moduleRegion = () =>
      linesOf(
        regionOf(readEnvExample(), "# wa:modules:start", "# wa:modules:end"),
      );

    it("asks for SMTP and leaves the operator secrets blank in the core part", () => {
      const core = parseDotenv(readEnvExample().split("# wa:modules:start")[0]);
      expect({
        MAIL_PROVIDER: core.MAIL_PROVIDER,
        BETTER_AUTH_SECRET: core.BETTER_AUTH_SECRET,
        POSTGRES_PASSWORD: core.POSTGRES_PASSWORD,
      }).toStrictEqual({
        MAIL_PROVIDER: "smtp",
        BETTER_AUTH_SECRET: "",
        POSTGRES_PASSWORD: "",
      });
      expect(Object.keys(core)).not.toContain("RESEND_API_KEY");
      expect(Object.keys(core)).not.toContain("SMTP_URL");
    });

    it("has the module region markers", () => {
      expect(linesOf(readEnvExample())).toEqual(
        expect.arrayContaining(["# wa:modules:start", "# wa:modules:end"]),
      );
    });

    it.skipIf(!isModuleInstalled("uploads"))(
      "points uploads at the container volume and the in-stack MinIO without default credentials",
      () => {
        const region = moduleRegion();
        expect(region).toEqual(
          expect.arrayContaining([
            "STORAGE_LOCAL_PATH=/app/volumes/uploads",
            "S3_ENDPOINT=http://minio:9000",
            "S3_ACCESS_KEY_ID=",
            "S3_SECRET_ACCESS_KEY=",
          ]),
        );
        expect(region.join("\n")).not.toContain("minioadmin");
      },
    );

    it.skipIf(!isModuleInstalled("api-keys"))(
      "leaves API_KEY_PEPPER blank for the operator",
      () => {
        expect(moduleRegion()).toContain("API_KEY_PEPPER=");
      },
    );

    it.skipIf(!isModuleInstalled("encryption"))(
      "leaves ENCRYPTION_MASTER_KEY blank for the operator",
      () => {
        expect(moduleRegion()).toContain("ENCRYPTION_MASTER_KEY=");
      },
    );
  });

  describe("docker-compose.selfhost.yml", () => {
    const readComposeText = () =>
      fs.readFileSync(path.join(repoRoot, COMPOSE_FILE), "utf8");

    const readCompose = () => parse(readComposeText()) as Compose;

    it("builds app and migrate from the repository into the same image", () => {
      const { app, migrate } = readCompose().services;
      expect(app.build).toBe(".");
      expect(migrate.build).toBe(".");
      expect(typeof app.image).toBe("string");
      expect(migrate.image).toBe(app.image);
    });

    it("runs migrate once", () => {
      expect(readCompose().services.migrate.restart).toBe("no");
    });

    it("keeps app uploads on a named volume", () => {
      expect(readCompose().services.app.volumes).toContain(
        "uploads:/app/volumes/uploads",
      );
    });

    it("declares the postgres-data and uploads volumes", () => {
      expect(Object.keys(readCompose().volumes as object)).toEqual(
        expect.arrayContaining(["postgres-data", "uploads"]),
      );
    });

    it("offers a tools service on the builder stage behind the tools profile", () => {
      const { tools } = readCompose().services;
      expect(tools.profiles).toEqual(["tools"]);
      expect((tools.build as { target?: string }).target).toBe("builder");
    });

    it("runs the database on postgres:16", () => {
      expect(readCompose().services.db.image).toBe("postgres:16");
    });

    it("has the service region markers", () => {
      expect(linesOf(readComposeText())).toEqual(
        expect.arrayContaining(["# wa:services:start", "# wa:services:end"]),
      );
    });

    it.skipIf(!isModuleInstalled("uploads"))(
      "adds minio and minio-init in the module region behind the s3 profile without published ports",
      () => {
        const region = regionOf(
          readComposeText(),
          "# wa:services:start",
          "# wa:services:end",
        );
        expect(region).toMatch(/^\s+minio:\s*$/m);
        expect(region).toMatch(/^\s+minio-init:\s*$/m);
        const { services } = readCompose();
        for (const name of ["minio", "minio-init"]) {
          expect(services[name].profiles).toEqual(["s3"]);
          expect(services[name].ports).toBeUndefined();
        }
      },
    );

    it.skipIf(!isModuleInstalled("uploads"))(
      "keeps minio-init running with a healthcheck, so up --wait waits for the bucket",
      () => {
        const minioInit = readCompose().services["minio-init"];
        expect(minioInit.restart).toBe("unless-stopped");
        expect(minioInit.healthcheck).toEqual(
          expect.objectContaining({
            test: ["CMD-SHELL", "test -f /tmp/bucket-ready"],
          }),
        );
      },
    );
  });
});
