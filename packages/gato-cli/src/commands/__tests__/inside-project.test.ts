import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { existsSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDirs } from "../../__tests__/helpers.js";
import { insideProject } from "../remove.js";

let dir: string;
let outside: string;

async function project(): Promise<void> {
  dir = await makeTempDir("wa-kit-inside-");
  outside = await makeTempDir("wa-kit-outside-");
  await mkdir(join(dir, "src"), { recursive: true });
}

describe("insideProject: zwykłe ścieżki", () => {
  afterEach(async () => {
    await removeTempDirs();
  });

  it("istniejący plik w projekcie: zwraca ścieżkę bezwzględną", async () => {
    await project();
    await writeFile(join(dir, "src/a.ts"), "export const a = 1;\n");

    await expect(insideProject(dir, "src/a.ts")).resolves.toBe(
      join(dir, "src/a.ts"),
    );
  });

  it("nieistniejąca ścieżka bez dowiązań w nieistniejących katalogach: zwraca ścieżkę bezwzględną", async () => {
    await project();

    await expect(insideProject(dir, "src/brand/new/file.ts")).resolves.toBe(
      join(dir, "src/brand/new/file.ts"),
    );
  });

  it("ścieżka z .. wychodząca poza projekt: błąd ścieżki", async () => {
    await project();

    await expect(insideProject(dir, "../x.ts")).rejects.toThrow(
      "Path outside the project: ../x.ts",
    );
  });
});

describe("insideProject: wiszące dowiązania", () => {
  afterEach(async () => {
    await removeTempDirs();
  });

  it("plik jako wiszące dowiązanie do brakującego pliku w istniejącym katalogu poza projektem: błąd ścieżki", async () => {
    await project();
    await symlink(join(outside, "missing.ts"), join(dir, "src/new.ts"));

    await expect(insideProject(dir, "src/new.ts")).rejects.toThrow(
      "Path outside the project: src/new.ts",
    );
    expect(existsSync(join(outside, "missing.ts"))).toBe(false);
  });

  it("plik jako wiszące dowiązanie do pliku w nieistniejącym katalogu poza projektem: błąd ścieżki", async () => {
    await project();
    await symlink(join(outside, "gone/x.ts"), join(dir, "src/new.ts"));

    await expect(insideProject(dir, "src/new.ts")).rejects.toThrow(
      "Path outside the project: src/new.ts",
    );
  });

  it("względne wiszące dowiązanie wychodzące poza projekt: błąd ścieżki", async () => {
    await project();
    await symlink(`../../${basename(outside)}/x.ts`, join(dir, "src/new.ts"));

    await expect(insideProject(dir, "src/new.ts")).rejects.toThrow(
      "Path outside the project: src/new.ts",
    );
  });

  it("katalog jako wiszące dowiązanie do katalogu poza projektem: plik pod nim daje błąd ścieżki", async () => {
    await project();
    await symlink(join(outside, "gone"), join(dir, "src/dir"));

    await expect(insideProject(dir, "src/dir/a.ts")).rejects.toThrow(
      "Path outside the project: src/dir/a.ts",
    );
  });

  it("łańcuch dowiązań: pierwsze w projekcie, drugie wiszące poza projekt: błąd ścieżki", async () => {
    await project();
    await symlink(join(outside, "x.ts"), join(dir, "src/b.ts"));
    await symlink("b.ts", join(dir, "src/a.ts"));

    await expect(insideProject(dir, "src/a.ts")).rejects.toThrow(
      "Path outside the project: src/a.ts",
    );
  });

  it("wiszące dowiązanie do brakującego pliku w projekcie: zwraca ścieżkę dowiązania", async () => {
    await project();
    await symlink("missing.ts", join(dir, "src/new.ts"));

    await expect(insideProject(dir, "src/new.ts")).resolves.toBe(
      join(dir, "src/new.ts"),
    );
  });

  it("względne wiszące dowiązanie liczone od katalogu dowiązania, nie od korzenia projektu: zostaje w projekcie", async () => {
    await project();
    await mkdir(join(dir, "src/deep"), { recursive: true });
    await symlink(
      `../../../${basename(dir)}/missing.ts`,
      join(dir, "src/deep/new.ts"),
    );

    await expect(insideProject(dir, "src/deep/new.ts")).resolves.toBe(
      join(dir, "src/deep/new.ts"),
    );
  });

  it("wiszące dowiązanie katalogu do brakującego katalogu w projekcie: plik pod nim przechodzi", async () => {
    await project();
    await symlink("gone", join(dir, "src/dir"));

    await expect(insideProject(dir, "src/dir/a.ts")).resolves.toBe(
      join(dir, "src/dir/a.ts"),
    );
  });
});

describe("insideProject: niezmienniki", () => {
  beforeAll(async () => {
    await project();
  });

  afterAll(async () => {
    await removeTempDirs();
  });

  const segment = fc.stringMatching(/^[a-z0-9][a-z0-9_-]{0,7}$/);

  test.prop([fc.array(segment, { minLength: 1, maxLength: 4 })], {
    numRuns: 30,
  })(
    "nieistniejąca ścieżka z bezpiecznych segmentów w projekcie: zwraca ją jako ścieżkę bezwzględną",
    async (segments) => {
      await expect(insideProject(dir, segments.join("/"))).resolves.toBe(
        join(dir, ...segments),
      );
    },
  );

  test.prop([fc.array(segment, { minLength: 0, maxLength: 3 })], {
    numRuns: 30,
  })(
    "ścieżka zaczynająca się od .. do rodzica projektu: zawsze błąd ścieżki",
    async (segments) => {
      const file = ["..", ...segments, "x.ts"].join("/");
      await expect(insideProject(dir, file)).rejects.toThrow(
        `Path outside the project: ${file}`,
      );
    },
  );
});
