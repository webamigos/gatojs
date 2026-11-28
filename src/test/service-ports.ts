import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

type Env = Record<string, string | undefined>;

export interface ServicePorts {
  db: number;
  mailpitUi: number;
  mailpitSmtp: number;
  minio: number;
}

export const SERVICE_PORT_VARIABLES = [
  "DB_PORT",
  "MAILPIT_UI_PORT",
  "MAILPIT_SMTP_PORT",
  "MINIO_PORT",
] as const;

const MAX_PORT = 65535;

function portFrom(env: Env, variable: string, defaultPort: number): number {
  const value = env[variable];
  if (value === undefined || value === "") {
    return defaultPort;
  }
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > MAX_PORT) {
    throw new Error(
      `${variable} must be a port number from 1 to ${MAX_PORT} (got: "${value}")`,
    );
  }
  return port;
}

export function servicePorts(env: Env): ServicePorts {
  return {
    db: portFrom(env, "DB_PORT", 5432),
    mailpitUi: portFrom(env, "MAILPIT_UI_PORT", 8025),
    mailpitSmtp: portFrom(env, "MAILPIT_SMTP_PORT", 1025),
    minio: portFrom(env, "MINIO_PORT", 9000),
  };
}

function readEnvFile(file: string): Env {
  if (!existsSync(file)) {
    return {};
  }
  return dotenv.parse(readFileSync(file));
}

// WHY: only the port keys are read; loading .env into process.env would hand e2e the dev DATABASE_URL.
export function readServicePortEnv(
  options: { cwd?: string; env?: Env } = {},
): Env {
  const cwd = options.cwd ?? process.cwd();
  const sources = [
    options.env ?? process.env,
    readEnvFile(path.join(cwd, ".env.local")),
    readEnvFile(path.join(cwd, ".env")),
  ];
  const result: Env = {};
  for (const variable of SERVICE_PORT_VARIABLES) {
    const source = sources.find((env) => env[variable] !== undefined);
    if (source !== undefined) {
      result[variable] = source[variable];
    }
  }
  return result;
}

export function localServicePorts(): ServicePorts {
  return servicePorts(readServicePortEnv());
}
