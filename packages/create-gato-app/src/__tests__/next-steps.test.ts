import { execFileSync } from "node:child_process";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { displayDir, nextSteps, shellQuote, type Outcome } from "../next-steps.js";

const NOTHING_DONE: Outcome = {
  dir: "my-app",
  git: true,
  installed: false,
  committed: false,
  dockerUp: false,
  profiles: [],
  migrated: false,
  adminCreated: false,
  adminEmail: null,
};

const EVERYTHING_DONE: Outcome = {
  dir: "my-app",
  git: true,
  installed: true,
  committed: true,
  dockerUp: true,
  profiles: [],
  migrated: true,
  adminCreated: true,
  adminEmail: "a@b.co",
};

const COMMIT_LINE = 'git add -A && git commit -m "chore: initial commit"';

describe("shellQuote", () => {
  it.each([
    ["my-app", "my-app"],
    ["my app", "'my app'"],
    ["it's", "'it'\\''s'"],
    ["", "''"],
    ["a@b.co", "a@b.co"],
    ["/x/app", "/x/app"],
    ["$HOME", "'$HOME'"],
  ])("%j daje %j", (value, expected) => {
    expect(shellQuote(value)).toBe(expected);
  });

  test.prop([fc.string({ maxLength: 20 }).filter((value) => !value.includes("\u0000"))], { numRuns: 40 })(
    "powłoka odczytuje zacytowaną wartość jako tę samą wartość",
    (value) => {
      expect(execFileSync("sh", ["-c", `printf %s ${shellQuote(value)}`], { encoding: "utf8" })).toBe(value);
    },
  );
});

describe("displayDir", () => {
  it.each([
    ["/w", "/w/my-app", "my-app"],
    ["/w", "/w", "."],
    ["/w", "/x/app", "/x/app"],
    ["/w", "/w/a b", "a b"],
    ["/w", "/w/nested/my-app", "nested/my-app"],
  ])("cwd %s i projekt %s dają %j", (cwd, projectDir, expected) => {
    expect(displayDir(cwd, projectDir)).toBe(expected);
  });
});

describe("nextSteps", () => {
  it("nic nie zrobiono: pełna lista kroków w kolejności", () => {
    expect(nextSteps(NOTHING_DONE)).toEqual([
      "cd my-app",
      "npm install",
      "docker compose up -d",
      "npx prisma migrate dev --name init",
      COMMIT_LINE,
      "npm run admin:create -- --email <your-email>",
      "npm run dev",
    ]);
  });

  it("wszystko zrobiono: zostaje cd i npm run dev", () => {
    expect(nextSteps(EVERYTHING_DONE)).toEqual(["cd my-app", "npm run dev"]);
  });

  it("katalog . nie ma kroku cd", () => {
    expect(nextSteps({ ...EVERYTHING_DONE, dir: "." })).toEqual(["npm run dev"]);
  });

  it("katalog ze spacją jest cytowany", () => {
    expect(nextSteps({ ...EVERYTHING_DONE, dir: "a b" })).toEqual(["cd 'a b'", "npm run dev"]);
  });

  it("profil s3 trafia do docker compose up", () => {
    expect(nextSteps({ ...NOTHING_DONE, profiles: ["s3"] })).toContain("docker compose --profile s3 up -d");
    expect(nextSteps({ ...NOTHING_DONE, profiles: ["s3"] })).not.toContain("docker compose up -d");
  });

  it("bez git nie ma kroku commita", () => {
    expect(nextSteps({ ...NOTHING_DONE, git: false })).toEqual([
      "cd my-app",
      "npm install",
      "docker compose up -d",
      "npx prisma migrate dev --name init",
      "npm run admin:create -- --email <your-email>",
      "npm run dev",
    ]);
  });

  it("podany e-mail administratora trafia do admin:create", () => {
    expect(nextSteps({ ...NOTHING_DONE, adminEmail: "a@b.co" })).toContain("npm run admin:create -- --email a@b.co");
    expect(nextSteps({ ...NOTHING_DONE, adminEmail: "a@b.co" })).not.toContain(
      "npm run admin:create -- --email <your-email>",
    );
  });

  it("po instalacji i commicie bez Dockera zostają Docker, migracja, admin i dev", () => {
    expect(
      nextSteps({ ...NOTHING_DONE, installed: true, committed: true }),
    ).toEqual([
      "cd my-app",
      "docker compose up -d",
      "npx prisma migrate dev --name init",
      "npm run admin:create -- --email <your-email>",
      "npm run dev",
    ]);
  });

  it("po instalacji, Dockerze i migracji bez commita zostaje commit, admin i dev", () => {
    expect(
      nextSteps({ ...NOTHING_DONE, installed: true, dockerUp: true, migrated: true }),
    ).toEqual(["cd my-app", COMMIT_LINE, "npm run admin:create -- --email <your-email>", "npm run dev"]);
  });

  it("po migracji bez administratora zostaje admin:create", () => {
    expect(
      nextSteps({ ...EVERYTHING_DONE, adminCreated: false, adminEmail: null }),
    ).toEqual(["cd my-app", "npm run admin:create -- --email <your-email>", "npm run dev"]);
  });
});
