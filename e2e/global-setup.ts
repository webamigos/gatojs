import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { assertE2eDatabase } from "./database-guard";
import { appEnv, E2E_ADMIN, E2E_PORTS } from "./env";
import { clearMailbox } from "./helpers";

function run(args: string[], env: Record<string, string>): void {
  execFileSync("npx", args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function hasMigrations(): boolean {
  const dir = "prisma/migrations";
  return (
    existsSync(dir) &&
    readdirSync(dir).some((entry) => entry !== "migration_lock.toml")
  );
}

export default async function globalSetup(): Promise<void> {
  const env = appEnv({
    port: E2E_PORTS.core,
    multiOrg: false,
    publicSignup: false,
  });
  assertE2eDatabase(env.DATABASE_URL);

  run(
    hasMigrations()
      ? ["prisma", "migrate", "reset", "--force"]
      : ["prisma", "db", "push", "--force-reset"],
    env,
  );
  run(
    [
      "tsx",
      "scripts/admin-create.ts",
      "--email",
      E2E_ADMIN.email,
      "--password",
      E2E_ADMIN.password,
      "--name",
      "Admin",
      "--yes",
    ],
    env,
  );
  await clearMailbox();
}
