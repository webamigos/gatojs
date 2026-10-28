import { existsSync, readdirSync } from "node:fs";

export function hasMigrations(dir: string): boolean {
  return (
    existsSync(dir) &&
    readdirSync(dir, { withFileTypes: true }).some((entry) =>
      entry.isDirectory(),
    )
  );
}
