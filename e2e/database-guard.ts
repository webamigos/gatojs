const E2E_DATABASE_SUFFIX = "_e2e";

export function databaseName(databaseUrl: string): string {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

export function assertE2eDatabase(databaseUrl: string): void {
  const name = databaseName(databaseUrl);
  if (!name.endsWith(E2E_DATABASE_SUFFIX)) {
    throw new Error(
      `E2E resetuje bazę danych, więc jej nazwa musi kończyć się na ${E2E_DATABASE_SUFFIX} (jest: "${name}")`,
    );
  }
}
