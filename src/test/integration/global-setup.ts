import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { assertTestDatabase, integrationDatabaseUrl } from "./database-url";

async function ensureDatabaseExists(
  databaseUrl: string,
  name: string,
): Promise<void> {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = integrationDatabaseUrl();
  const name = assertTestDatabase(databaseUrl);
  await ensureDatabaseExists(databaseUrl, name);
  execFileSync("npx", ["prisma", "db", "push"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
