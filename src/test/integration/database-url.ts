export const TEST_DATABASE_SUFFIX = "_test";

export const DEFAULT_INTEGRATION_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/wa_app_test";

export function integrationDatabaseUrl(): string {
  return (
    process.env.INTEGRATION_DATABASE_URL ?? DEFAULT_INTEGRATION_DATABASE_URL
  );
}

export function assertTestDatabase(databaseUrl: string): string {
  const name = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, ""),
  );
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Testy integracyjne czyszczą bazę, więc jej nazwa musi kończyć się na ${TEST_DATABASE_SUFFIX} (jest: "${name}")`,
    );
  }
  return name;
}
