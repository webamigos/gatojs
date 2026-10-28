import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasMigrations } from "../migrations";

describe("hasMigrations", () => {
  let root: string;
  let dir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wa-migrations-"));
    dir = join(root, "migrations");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("zwraca false, gdy katalog nie istnieje", () => {
    expect(hasMigrations(dir)).toBe(false);
  });

  it("zwraca false dla pustego katalogu", () => {
    mkdirSync(dir);
    expect(hasMigrations(dir)).toBe(false);
  });

  it("zwraca false, gdy jest tylko .gitignore", () => {
    mkdirSync(dir);
    writeFileSync(join(dir, ".gitignore"), "*\n");
    expect(hasMigrations(dir)).toBe(false);
  });

  it("zwraca false, gdy jest tylko migration_lock.toml", () => {
    mkdirSync(dir);
    writeFileSync(
      join(dir, "migration_lock.toml"),
      'provider = "postgresql"\n',
    );
    expect(hasMigrations(dir)).toBe(false);
  });

  it("zwraca false, gdy są tylko .gitignore i migration_lock.toml", () => {
    mkdirSync(dir);
    writeFileSync(join(dir, ".gitignore"), "*\n");
    writeFileSync(
      join(dir, "migration_lock.toml"),
      'provider = "postgresql"\n',
    );
    expect(hasMigrations(dir)).toBe(false);
  });

  it("zwraca true, gdy jest podkatalog migracji", () => {
    mkdirSync(join(dir, "20250101000000_init"), { recursive: true });
    writeFileSync(
      join(dir, "20250101000000_init", "migration.sql"),
      "SELECT 1;\n",
    );
    expect(hasMigrations(dir)).toBe(true);
  });

  it("zwraca true, gdy obok podkatalogu migracji leży .gitignore", () => {
    mkdirSync(join(dir, "20250101000000_init"), { recursive: true });
    writeFileSync(
      join(dir, "20250101000000_init", "migration.sql"),
      "SELECT 1;\n",
    );
    writeFileSync(join(dir, ".gitignore"), "*\n");
    writeFileSync(
      join(dir, "migration_lock.toml"),
      'provider = "postgresql"\n',
    );
    expect(hasMigrations(dir)).toBe(true);
  });
});
