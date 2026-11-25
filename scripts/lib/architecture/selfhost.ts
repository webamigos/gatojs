import fs from "node:fs";
import path from "node:path";
import { checkEnv } from "@gatojs/env";
import { parse } from "yaml";
import { moduleEnvSchemas } from "@/modules.generated";
import { parseDotenv } from "./dotenv";
import { readRepoFile } from "./repo-files";

const COMPOSE_FILE = "docker-compose.selfhost.yml";
const ENV_EXAMPLE_FILE = ".env.selfhost.example";
const KIT_STATE_FILE = ".wa/kit.json";
const HEALTHCHECK_PATH = "/api/healthcheck";
const MAIL_RELAY_IMAGE = "axllent/mailpit";
const TOOLS_PROFILE = "tools";

type ComposeService = {
  image?: unknown;
  restart?: unknown;
  profiles?: unknown;
  ports?: unknown;
  depends_on?: unknown;
  healthcheck?: { test?: unknown };
};

type ComposeFile = { services?: Record<string, ComposeService | null> };

type GenerateKind = "secret-32" | "secret-64" | "hex-32";

type KitState = {
  modules?: Record<
    string,
    { manifest?: { env?: { name: string; generate?: GenerateKind }[] } }
  >;
};

const GENERATED_VALUES: Record<GenerateKind, string> = {
  "secret-32": "s".repeat(32),
  "secret-64": "s".repeat(64),
  "hex-32": "ab".repeat(32),
};

function dependencyCondition(
  service: ComposeService | null | undefined,
  dependency: string,
): unknown {
  const dependsOn = service?.depends_on;
  if (
    dependsOn === null ||
    typeof dependsOn !== "object" ||
    Array.isArray(dependsOn)
  ) {
    return undefined;
  }
  const entry = (dependsOn as Record<string, { condition?: unknown } | null>)[
    dependency
  ];
  return entry?.condition;
}

function hasHealthcheckOn(
  service: ComposeService | null | undefined,
  urlPath: string,
): boolean {
  const test = service?.healthcheck?.test;
  const parts = Array.isArray(test) ? test : [test];
  return parts.some(
    (part) => typeof part === "string" && part.includes(urlPath),
  );
}

function publishesPorts(service: ComposeService | null | undefined): boolean {
  const ports = service?.ports;
  return Array.isArray(ports) && ports.length > 0;
}

function isMailRelayImage(image: unknown): boolean {
  return (
    typeof image === "string" &&
    (image === MAIL_RELAY_IMAGE || image.startsWith(`${MAIL_RELAY_IMAGE}:`))
  );
}

function isOneShot(service: ComposeService | null | undefined): boolean {
  const profiles = service?.profiles;
  const isTool = Array.isArray(profiles) && profiles.includes(TOOLS_PROFILE);
  return service?.restart === "no" && !isTool;
}

function isAwaitedToComplete(
  services: Record<string, ComposeService | null>,
  name: string,
): boolean {
  return Object.values(services).some(
    (service) =>
      dependencyCondition(service, name) === "service_completed_successfully",
  );
}

export function checkSelfhostCompose(root: string): string[] {
  const compose = (parse(readRepoFile(root, COMPOSE_FILE)) ??
    {}) as ComposeFile;
  const services = compose.services ?? {};
  const issues: string[] = [];
  if (
    dependencyCondition(services.app, "migrate") !==
    "service_completed_successfully"
  ) {
    issues.push(
      `${COMPOSE_FILE}: app must wait for migrate to complete (service_completed_successfully)`,
    );
  }
  if (dependencyCondition(services.migrate, "db") !== "service_healthy") {
    issues.push(
      `${COMPOSE_FILE}: migrate must wait for a healthy db (service_healthy)`,
    );
  }
  if (!hasHealthcheckOn(services.app, HEALTHCHECK_PATH)) {
    issues.push(
      `${COMPOSE_FILE}: app needs a healthcheck on ${HEALTHCHECK_PATH}`,
    );
  }
  if (publishesPorts(services.db)) {
    issues.push(`${COMPOSE_FILE}: db must not publish a port`);
  }
  for (const [name, service] of Object.entries(services)) {
    if (isMailRelayImage(service?.image)) {
      issues.push(
        `${COMPOSE_FILE}: no mail relay in the self-hosted stack (${name})`,
      );
    }
  }
  for (const [name, service] of Object.entries(services)) {
    if (
      name !== "migrate" &&
      isOneShot(service) &&
      !isAwaitedToComplete(services, name)
    ) {
      issues.push(
        `${COMPOSE_FILE}: ${name} runs once (restart: "no"), so another service must wait for it to complete (service_completed_successfully) or up --wait fails`,
      );
    }
  }
  return issues;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function generatedVariables(root: string): Map<string, GenerateKind> {
  const file = path.join(root, KIT_STATE_FILE);
  const kinds = new Map<string, GenerateKind>();
  if (!fs.existsSync(file)) {
    return kinds;
  }
  const state = JSON.parse(fs.readFileSync(file, "utf8")) as KitState;
  for (const installed of Object.values(state.modules ?? {})) {
    for (const variable of installed.manifest?.env ?? []) {
      if (variable.generate !== undefined) {
        kinds.set(variable.name, variable.generate);
      }
    }
  }
  return kinds;
}

function withOperatorValues(
  file: Record<string, string>,
  generated: Map<string, GenerateKind>,
): Record<string, string> {
  const source = { ...file };
  const fillBlank = (name: string, value: string) => {
    if (isBlank(source[name])) {
      source[name] = value;
    }
  };
  fillBlank("BETTER_AUTH_SECRET", "s".repeat(32));
  if (
    source.MAIL_PROVIDER?.trim().toLowerCase() === "smtp" &&
    isBlank(source.SMTP_URL)
  ) {
    fillBlank("SMTP_HOST", "relay.internal");
  }
  for (const [name, kind] of generated) {
    fillBlank(name, GENERATED_VALUES[kind]);
  }
  source.DATABASE_URL = "postgresql://db:5432/app";
  source.NODE_ENV = "production";
  return source;
}

export function checkSelfhostEnvExample(root: string): string[] {
  const source = withOperatorValues(
    parseDotenv(readRepoFile(root, ENV_EXAMPLE_FILE)),
    generatedVariables(root),
  );
  const result = checkEnv(source, moduleEnvSchemas);
  if (result.ok) {
    return [];
  }
  return result.issues.map(
    ({ name, message }) => `${ENV_EXAMPLE_FILE}: ${name}: ${message}`,
  );
}
