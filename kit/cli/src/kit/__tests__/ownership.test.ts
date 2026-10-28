import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeKitRepo, removeTempDirs } from "../../__tests__/helpers.js";
import { checkOwnership } from "../ownership.js";

function findRepoRoot(start: string): string {
  let dir = resolve(start);
  while (!(
    existsSync(join(dir, "kit/kit.json")) &&
    existsSync(join(dir, "kit/cli/package.json"))
  )) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Nie znaleziono korzenia repozytorium");
    dir = parent;
  }
  return dir;
}

const REPO_ROOT = findRepoRoot(import.meta.dirname);

afterEach(removeTempDirs);

describe("checkOwnership na fixture ownership-broken", () => {
  it("wykrywa plik bez właściciela", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.unowned).toEqual(["orphan.ts"]);
  });

  it("wykrywa plik z dwoma właścicielami", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.multiOwned).toEqual([
      { file: "src/shared/x.ts", owners: ["core", "demo"] },
    ]);
  });

  it("wykrywa pusty glob i glob z klamrą, klamra bez wpisu empty", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.globErrors).toEqual([
      { module: "demo", glob: "src/nie-ma/**", reason: "empty" },
      { module: "demo", glob: "src/{a,b}/**", reason: "brace" },
    ]);
  });

  it("wykrywa zależność bez właściciela", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.unownedDependencies).toEqual(["lonely-dep"]);
  });

  it("wykrywa różną wersję i zależność manifestu bez package.json", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.dependencyMismatch).toEqual([
      {
        module: "demo",
        name: "ghost",
        manifest: "1.0.0",
        packageJson: "<brak>",
      },
      {
        module: "demo",
        name: "left-pad",
        manifest: "^1.3.0",
        packageJson: "^1.2.0",
      },
    ]);
  });

  it("wykrywa compose spoza plików modułu", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.composeOutsideModule).toEqual(["demo"]);
  });

  it("nie zgłasza plików kitOnly ani generatedFiles jako bez właściciela", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.unowned).not.toContain("docs/readme.md");
    expect(report.unowned).not.toContain("kit/kit.json");
    expect(report.unowned).not.toContain("src/modules.generated.ts");
  });
});

describe("checkOwnership na fixture ownership-order", () => {
  it("sortuje niezgodności zależności po module, potem po nazwie", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-order"));
    expect(report.dependencyMismatch).toEqual([
      {
        module: "alpha",
        name: "beta-lib",
        manifest: "2.0.0",
        packageJson: "2.1.0",
      },
      {
        module: "alpha",
        name: "mid",
        manifest: "1.0.0",
        packageJson: "<brak>",
      },
      {
        module: "core",
        name: "axios",
        manifest: "^1.0.0",
        packageJson: "^1.1.0",
      },
      {
        module: "core",
        name: "zod",
        manifest: "^3.0.0",
        packageJson: "^3.1.0",
      },
      { module: "zeta", name: "ant", manifest: "1.0.0", packageJson: "<brak>" },
      {
        module: "zeta",
        name: "yarn-x",
        manifest: "1.0.0",
        packageJson: "1.1.0",
      },
    ]);
  });

  it("sortuje zależności bez właściciela rosnąco", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-order"));
    expect(report.unownedDependencies).toEqual([
      "unowned-a",
      "unowned-b",
      "unowned-m",
      "unowned-z",
    ]);
  });

  it("sortuje błędy globów po module, potem po globie", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-order"));
    expect(report.globErrors).toEqual([
      { module: "alpha", glob: "b-alpha-pusty/**", reason: "empty" },
      { module: "alpha", glob: "y-alpha-pusty/**", reason: "empty" },
      { module: "core", glob: "aa-core-pusty/**", reason: "empty" },
      { module: "core", glob: "zz-core-pusty/**", reason: "empty" },
      { module: "zeta", glob: "k-zeta-pusty/**", reason: "empty" },
      { module: "zeta", glob: "w-zeta-pusty/**", reason: "empty" },
    ]);
  });

  it("sortuje moduły z compose spoza plików rosnąco", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-order"));
    expect(report.composeOutsideModule).toEqual(["alpha", "core", "zeta"]);
  });

  it("nie zgłasza plików bez właściciela ani z wieloma właścicielami", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-order"));
    expect(report.unowned).toEqual([]);
    expect(report.multiOwned).toEqual([]);
  });
});

describe("checkOwnership na repozytorium wa-kit", () => {
  it("każdy plik i każda zależność ma dokładnie jednego właściciela", async () => {
    expect(await checkOwnership(REPO_ROOT)).toEqual({
      unowned: [],
      multiOwned: [],
      globErrors: [],
      unownedDependencies: [],
      dependencyMismatch: [],
      composeOutsideModule: [],
    });
  });
});
