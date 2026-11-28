import { readServicePortEnv, servicePorts } from "../service-ports";

export const TEST_DATABASE_SUFFIX = "_test";

export function defaultIntegrationDatabaseUrl(dbPort: number): string {
  return `postgresql://postgres:postgres@localhost:${dbPort}/wa_app_test`;
}

export function integrationDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.INTEGRATION_DATABASE_URL ??
    defaultIntegrationDatabaseUrl(servicePorts(readServicePortEnv({ env })).db)
  );
}

export function assertTestDatabase(databaseUrl: string): string {
  const name = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, ""),
  );
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Integration tests wipe the database, so its name must end with ${TEST_DATABASE_SUFFIX} (got: "${name}")`,
    );
  }
  return name;
}
