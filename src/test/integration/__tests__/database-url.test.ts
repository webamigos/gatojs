import { afterEach, describe, expect, it, vi } from "vitest";
import * as databaseUrl from "../database-url";
import {
  assertTestDatabase,
  defaultIntegrationDatabaseUrl,
  integrationDatabaseUrl,
} from "../database-url";

const DEV_CREDENTIALS = "postgres:postgres";

function urlParts(url: string) {
  const parsed = new URL(url);
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

function devTestDatabase(port: string) {
  return {
    protocol: "postgresql:",
    username: "postgres",
    password: "postgres",
    hostname: "localhost",
    port,
    pathname: "/wa_app_test",
    search: "",
    hash: "",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("defaultIntegrationDatabaseUrl", () => {
  it("builds the wa_app_test URL on the given port", () => {
    expect(urlParts(defaultIntegrationDatabaseUrl(5433))).toEqual(
      devTestDatabase("5433"),
    );
  });

  it("builds the URL on the default Docker port", () => {
    expect(urlParts(defaultIntegrationDatabaseUrl(5432))).toEqual(
      devTestDatabase("5432"),
    );
  });

  it("keeps the dev credentials as user:pass@ in the URL", () => {
    expect(defaultIntegrationDatabaseUrl(5433)).toContain(
      `//${DEV_CREDENTIALS}@localhost:`,
    );
  });

  it("the hard-coded DEFAULT_INTEGRATION_DATABASE_URL is gone", () => {
    expect(databaseUrl).not.toHaveProperty("DEFAULT_INTEGRATION_DATABASE_URL");
  });
});

describe("integrationDatabaseUrl", () => {
  it("returns INTEGRATION_DATABASE_URL when it is set", () => {
    expect(
      integrationDatabaseUrl({
        INTEGRATION_DATABASE_URL: "postgresql://h:1/x_test",
      }),
    ).toBe("postgresql://h:1/x_test");
  });

  it("returns INTEGRATION_DATABASE_URL with credentials unchanged", () => {
    const url = `postgresql://u:p@h:${1}/x_test`;
    expect(
      urlParts(integrationDatabaseUrl({ INTEGRATION_DATABASE_URL: url })),
    ).toEqual({
      protocol: "postgresql:",
      username: "u",
      password: "p",
      hostname: "h",
      port: "1",
      pathname: "/x_test",
      search: "",
      hash: "",
    });
  });

  it("INTEGRATION_DATABASE_URL wins over DB_PORT", () => {
    expect(
      integrationDatabaseUrl({
        INTEGRATION_DATABASE_URL: "postgresql://h:1/x_test",
        DB_PORT: "5433",
      }),
    ).toBe("postgresql://h:1/x_test");
  });

  it("without INTEGRATION_DATABASE_URL uses DB_PORT from the given env", () => {
    expect(urlParts(integrationDatabaseUrl({ DB_PORT: "5433" }))).toEqual(
      devTestDatabase("5433"),
    );
  });

  it("the given env wins over DB_PORT in the process env", () => {
    vi.stubEnv("DB_PORT", "5999");
    vi.stubEnv("INTEGRATION_DATABASE_URL", undefined);
    expect(urlParts(integrationDatabaseUrl({ DB_PORT: "5434" }))).toEqual(
      devTestDatabase("5434"),
    );
  });

  it("without an argument reads INTEGRATION_DATABASE_URL from the process env", () => {
    vi.stubEnv("INTEGRATION_DATABASE_URL", "postgresql://db:7/y_test");
    expect(integrationDatabaseUrl()).toBe("postgresql://db:7/y_test");
  });

  it("without an argument uses DB_PORT from the process env", () => {
    vi.stubEnv("INTEGRATION_DATABASE_URL", undefined);
    vi.stubEnv("DB_PORT", "5441");
    expect(urlParts(integrationDatabaseUrl())).toEqual(devTestDatabase("5441"));
  });

  it("an invalid DB_PORT throws naming DB_PORT instead of falling back to 5432", () => {
    expect(() => integrationDatabaseUrl({ DB_PORT: "abc" })).toThrow(/DB_PORT/);
  });
});

describe("assertTestDatabase", () => {
  it("returns the database name ending with _test", () => {
    expect(
      assertTestDatabase(
        `postgresql://${DEV_CREDENTIALS}@localhost:5433/wa_app_test`,
      ),
    ).toBe("wa_app_test");
  });

  it("rejects a database whose name does not end with _test", () => {
    expect(() =>
      assertTestDatabase(
        `postgresql://${DEV_CREDENTIALS}@localhost:5433/wa_app`,
      ),
    ).toThrow(/_test/);
  });
});
