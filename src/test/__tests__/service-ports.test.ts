import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fc, test } from "@fast-check/vitest";
import {
  localServicePorts,
  readServicePortEnv,
  SERVICE_PORT_VARIABLES,
  servicePorts,
} from "../service-ports";

const FIELD_OF_VARIABLE = {
  DB_PORT: "db",
  MAILPIT_UI_PORT: "mailpitUi",
  MAILPIT_SMTP_PORT: "mailpitSmtp",
  MINIO_PORT: "minio",
} as const;

const DEFAULT_PORTS = {
  db: 5432,
  mailpitUi: 8025,
  mailpitSmtp: 1025,
  minio: 9000,
};

const ALL_VARIABLES = [
  "DB_PORT",
  "MAILPIT_UI_PORT",
  "MAILPIT_SMTP_PORT",
  "MINIO_PORT",
] as const;

const tempDirs: string[] = [];

function projectDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "service-ports-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("SERVICE_PORT_VARIABLES", () => {
  it("lists the four port variables in a fixed order", () => {
    expect([...SERVICE_PORT_VARIABLES]).toEqual([
      "DB_PORT",
      "MAILPIT_UI_PORT",
      "MAILPIT_SMTP_PORT",
      "MINIO_PORT",
    ]);
  });
});

describe("servicePorts", () => {
  it("an empty env gives the default Docker ports", () => {
    expect(servicePorts({})).toStrictEqual({
      db: 5432,
      mailpitUi: 8025,
      mailpitSmtp: 1025,
      minio: 9000,
    });
  });

  it("each variable sets its own port", () => {
    expect(
      servicePorts({
        DB_PORT: "5433",
        MAILPIT_UI_PORT: "8026",
        MAILPIT_SMTP_PORT: "1026",
        MINIO_PORT: "9002",
      }),
    ).toStrictEqual({
      db: 5433,
      mailpitUi: 8026,
      mailpitSmtp: 1026,
      minio: 9002,
    });
  });

  it("a blank DB_PORT means the default port and leaves the others alone", () => {
    expect(
      servicePorts({ DB_PORT: "", MAILPIT_UI_PORT: "8026" }),
    ).toStrictEqual({
      db: 5432,
      mailpitUi: 8026,
      mailpitSmtp: 1025,
      minio: 9000,
    });
  });

  it("an undefined value means the default port", () => {
    expect(servicePorts({ MINIO_PORT: undefined })).toStrictEqual(
      DEFAULT_PORTS,
    );
  });

  it("the edge ports 1 and 65535 are accepted", () => {
    expect(servicePorts({ DB_PORT: "1", MINIO_PORT: "65535" })).toStrictEqual({
      db: 1,
      mailpitUi: 8025,
      mailpitSmtp: 1025,
      minio: 65535,
    });
  });

  it.each(["abc", "0", "65536", "54.3", "5433abc", "-5433"])(
    "DB_PORT=%s throws an error naming DB_PORT instead of using the default",
    (value) => {
      expect(() => servicePorts({ DB_PORT: value })).toThrow(/DB_PORT/);
    },
  );

  it("an invalid MINIO_PORT names MINIO_PORT, not DB_PORT", () => {
    expect(() => servicePorts({ MINIO_PORT: "nine" })).toThrow(/MINIO_PORT/);
    expect(() => servicePorts({ MINIO_PORT: "nine" })).not.toThrow(/DB_PORT/);
  });

  it("ignores variables other than the four port variables", () => {
    expect(
      servicePorts({
        DATABASE_URL: "postgresql://localhost:6000/x",
        PORT: "3000",
      }),
    ).toStrictEqual(DEFAULT_PORTS);
  });

  test.prop([
    fc.constantFrom(...ALL_VARIABLES),
    fc.integer({ min: 1, max: 65535 }),
  ])("any port 1-65535 round-trips into its own field", (variable, port) => {
    expect(servicePorts({ [variable]: `${port}` })).toStrictEqual({
      ...DEFAULT_PORTS,
      [FIELD_OF_VARIABLE[variable]]: port,
    });
  });

  test.prop([
    fc.constantFrom(...ALL_VARIABLES),
    fc.oneof(
      fc.integer({ max: 0 }).map(String),
      fc.integer({ min: 65536 }).map(String),
      fc
        .tuple(
          fc.integer({ min: 1, max: 65535 }),
          fc.integer({ min: 1, max: 99 }),
        )
        .map(([whole, fraction]) => `${whole}.${fraction}`),
      fc
        .tuple(
          fc.integer({ min: 1, max: 65535 }),
          fc.stringMatching(/^[a-z]{1,4}$/),
        )
        .map(([port, suffix]) => `${port}${suffix}`),
      fc.stringMatching(/^[a-zA-Z]{1,8}$/),
    ),
  ])(
    "any value that is not an integer in 1-65535 throws naming the variable",
    (variable, value) => {
      expect(() => servicePorts({ [variable]: value })).toThrow(
        new RegExp(variable),
      );
    },
  );
});

describe("readServicePortEnv", () => {
  it("reads DB_PORT from .env when there is no .env.local and the env is empty", () => {
    const cwd = projectDir({ ".env": "DB_PORT=5433\n" });
    const result = readServicePortEnv({ cwd, env: {} });
    expect(result).toEqual({ DB_PORT: "5433" });
    expect(result.DB_PORT).toBe("5433");
  });

  it("reads all four port variables from .env", () => {
    const cwd = projectDir({
      ".env":
        "DB_PORT=5433\nMAILPIT_UI_PORT=8026\nMAILPIT_SMTP_PORT=1026\nMINIO_PORT=9002\n",
    });
    expect(readServicePortEnv({ cwd, env: {} })).toEqual({
      DB_PORT: "5433",
      MAILPIT_UI_PORT: "8026",
      MAILPIT_SMTP_PORT: "1026",
      MINIO_PORT: "9002",
    });
  });

  it(".env.local wins over .env", () => {
    const cwd = projectDir({
      ".env": "DB_PORT=5433\n",
      ".env.local": "DB_PORT=5434\n",
    });
    expect(readServicePortEnv({ cwd, env: {} }).DB_PORT).toBe("5434");
  });

  it("the process env wins over .env.local and .env", () => {
    const cwd = projectDir({
      ".env": "DB_PORT=5433\n",
      ".env.local": "DB_PORT=5434\n",
    });
    expect(readServicePortEnv({ cwd, env: { DB_PORT: "5435" } }).DB_PORT).toBe(
      "5435",
    );
  });

  it("the process env wins over .env without .env.local", () => {
    const cwd = projectDir({ ".env": "DB_PORT=5433\n" });
    expect(readServicePortEnv({ cwd, env: { DB_PORT: "5435" } }).DB_PORT).toBe(
      "5435",
    );
  });

  it("each variable takes its own most specific source", () => {
    const cwd = projectDir({
      ".env": "DB_PORT=5433\nMAILPIT_UI_PORT=8026\nMINIO_PORT=9002\n",
      ".env.local": "MAILPIT_UI_PORT=8027\n",
    });
    expect(readServicePortEnv({ cwd, env: { MINIO_PORT: "9003" } })).toEqual({
      DB_PORT: "5433",
      MAILPIT_UI_PORT: "8027",
      MINIO_PORT: "9003",
    });
  });

  it("never returns DATABASE_URL or other keys from .env, .env.local or the env", () => {
    const cwd = projectDir({
      ".env":
        "DATABASE_URL=postgresql://localhost:5433/dev_db\nDB_PORT=5433\nSECRET=x\n",
      ".env.local": "BETTER_AUTH_SECRET=local\n",
    });
    const result = readServicePortEnv({
      cwd,
      env: { PATH: "/usr/bin", SMTP_URL: "smtp://localhost:1025" },
    });
    expect(result.DB_PORT).toBe("5433");
    expect(
      Object.keys(result).filter(
        (key) => !(ALL_VARIABLES as readonly string[]).includes(key),
      ),
    ).toEqual([]);
    expect(result).not.toHaveProperty("DATABASE_URL");
  });

  it("never writes to process.env", () => {
    vi.stubEnv("DB_PORT", undefined);
    vi.stubEnv("MINIO_PORT", undefined);
    vi.stubEnv("MAILPIT_UI_PORT", undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/keep_me");
    const cwd = projectDir({
      ".env":
        "DATABASE_URL=postgresql://localhost:5433/dev_db\nDB_PORT=5433\nMINIO_PORT=9002\n",
      ".env.local": "MAILPIT_UI_PORT=8026\n",
    });
    readServicePortEnv({ cwd, env: {} });
    readServicePortEnv({ cwd });
    expect(process.env.DB_PORT).toBeUndefined();
    expect(process.env.MINIO_PORT).toBeUndefined();
    expect(process.env.MAILPIT_UI_PORT).toBeUndefined();
    expect(process.env.DATABASE_URL).toBe(
      "postgresql://localhost:5432/keep_me",
    );
  });

  it("missing .env files give no port values and do not throw", () => {
    const cwd = projectDir({});
    const result = readServicePortEnv({ cwd, env: {} });
    expect(result).toEqual({});
    expect(result.DB_PORT).toBeUndefined();
    expect(result.MAILPIT_UI_PORT).toBeUndefined();
    expect(result.MAILPIT_SMTP_PORT).toBeUndefined();
    expect(result.MINIO_PORT).toBeUndefined();
  });

  it("a commented port line in .env is not read", () => {
    const cwd = projectDir({ ".env": "# DB_PORT=5433\n" });
    expect(readServicePortEnv({ cwd, env: {} }).DB_PORT).toBeUndefined();
  });

  it("the given env replaces process.env as the top source", () => {
    vi.stubEnv("DB_PORT", "5999");
    const cwd = projectDir({ ".env": "DB_PORT=5433\n" });
    expect(readServicePortEnv({ cwd, env: {} }).DB_PORT).toBe("5433");
  });

  it("without an env option the process env wins over .env", () => {
    vi.stubEnv("DB_PORT", "5999");
    const cwd = projectDir({ ".env": "DB_PORT=5433\n" });
    expect(readServicePortEnv({ cwd }).DB_PORT).toBe("5999");
  });
});

describe("localServicePorts", () => {
  it("uses the port variables of the process env", () => {
    vi.stubEnv("DB_PORT", "5440");
    vi.stubEnv("MAILPIT_UI_PORT", "8040");
    vi.stubEnv("MAILPIT_SMTP_PORT", "1040");
    vi.stubEnv("MINIO_PORT", "9040");
    expect(localServicePorts()).toStrictEqual({
      db: 5440,
      mailpitUi: 8040,
      mailpitSmtp: 1040,
      minio: 9040,
    });
  });
});
