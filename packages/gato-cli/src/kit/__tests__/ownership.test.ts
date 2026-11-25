import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeKitRepo, removeTempDirs } from "../../__tests__/helpers.js";
import { checkOwnership } from "../ownership.js";

function findRepoRoot(start: string): string {
  let dir = resolve(start);
  while (!(
    existsSync(join(dir, "kit/kit.json")) &&
    existsSync(join(dir, "packages/gato-cli/package.json"))
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
    expect(report.unownedDependencies).toEqual([
      { section: "devDependencies", name: "lonely-dep" },
    ]);
  });

  it("wykrywa różną wersję i zależność manifestu bez package.json", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.dependencyMismatch).toEqual([
      {
        module: "demo",
        section: "dependencies",
        name: "ghost",
        manifest: "1.0.0",
        packageJson: "<missing>",
      },
      {
        module: "demo",
        section: "dependencies",
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

  it("reports a selfhostCompose outside the module files and skips one inside them", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-broken"));
    expect(report.selfhostComposeOutsideModule).toEqual(["demo"]);
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
        section: "dependencies",
        name: "beta-lib",
        manifest: "2.0.0",
        packageJson: "2.1.0",
      },
      {
        module: "alpha",
        section: "dependencies",
        name: "mid",
        manifest: "1.0.0",
        packageJson: "<missing>",
      },
      {
        module: "core",
        section: "dependencies",
        name: "axios",
        manifest: "^1.0.0",
        packageJson: "^1.1.0",
      },
      {
        module: "core",
        section: "dependencies",
        name: "zod",
        manifest: "^3.0.0",
        packageJson: "^3.1.0",
      },
      {
        module: "zeta",
        section: "dependencies",
        name: "ant",
        manifest: "1.0.0",
        packageJson: "<missing>",
      },
      {
        module: "zeta",
        section: "dependencies",
        name: "yarn-x",
        manifest: "1.0.0",
        packageJson: "1.1.0",
      },
    ]);
  });

  it("sortuje zależności bez właściciela po sekcji, potem po nazwie", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-order"));
    expect(report.unownedDependencies).toEqual([
      { section: "dependencies", name: "unowned-b" },
      { section: "dependencies", name: "unowned-m" },
      { section: "dependencies", name: "unowned-z" },
      { section: "devDependencies", name: "unowned-a" },
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

  it("sorts the modules with a selfhostCompose outside their files by code point", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-order"));
    expect(report.selfhostComposeOutsideModule).toEqual([
      "alpha",
      "core",
      "zeta",
    ]);
  });

  it("nie zgłasza plików bez właściciela ani z wieloma właścicielami", async () => {
    const report = await checkOwnership(await makeKitRepo("ownership-order"));
    expect(report.unowned).toEqual([]);
    expect(report.multiOwned).toEqual([]);
  });
});

describe("checkOwnership na fixture ownership-sections", () => {
  it("porównuje zależności osobno dla każdej sekcji i sortuje po sekcji, potem po nazwie", async () => {
    const report = await checkOwnership(
      await makeKitRepo("ownership-sections"),
    );
    expect(report.dependencyMismatch).toEqual([
      {
        module: "core",
        section: "dependencies",
        name: "diff",
        manifest: "2.0.0",
        packageJson: "2.1.0",
      },
      {
        module: "core",
        section: "dependencies",
        name: "wrongdev",
        manifest: "^4.0.0",
        packageJson: "<missing>",
      },
      {
        module: "core",
        section: "devDependencies",
        name: "aaa-wrongdeps",
        manifest: "3.0.0",
        packageJson: "<missing>",
      },
      {
        module: "core",
        section: "devDependencies",
        name: "devdiff",
        manifest: "2.0.0",
        packageJson: "2.1.0",
      },
    ]);
  });

  it("nazwa w sekcji, której żaden moduł w niej nie deklaruje, jest bez właściciela mimo deklaracji w drugiej sekcji", async () => {
    const report = await checkOwnership(
      await makeKitRepo("ownership-sections"),
    );
    expect(report.unownedDependencies).toEqual([
      { section: "dependencies", name: "aaa-wrongdeps" },
      { section: "dependencies", name: "zz-free" },
      { section: "devDependencies", name: "aa-free" },
      { section: "devDependencies", name: "twin" },
      { section: "devDependencies", name: "wrongdev" },
    ]);
  });

  it("ta sama nazwa w obu sekcjach z zgodnymi wersjami nie daje rozbieżności", async () => {
    const report = await checkOwnership(
      await makeKitRepo("ownership-sections"),
    );
    expect(
      report.dependencyMismatch.filter((entry) => entry.name === "dual"),
    ).toEqual([]);
    expect(
      report.unownedDependencies.filter((entry) => entry.name === "dual"),
    ).toEqual([]);
  });
});

describe("checkOwnership on the ownership-selfhost fixture", () => {
  it("checks selfhostCompose, not compose, against the module files", async () => {
    const report = await checkOwnership(
      await makeKitRepo("ownership-selfhost"),
    );
    expect(report.selfhostComposeOutsideModule).toEqual(["core"]);
  });

  it("checks compose independently of selfhostCompose", async () => {
    const report = await checkOwnership(
      await makeKitRepo("ownership-selfhost"),
    );
    expect(report.composeOutsideModule).toEqual(["demo"]);
  });

  it("has no unowned or multi-owned files", async () => {
    const report = await checkOwnership(
      await makeKitRepo("ownership-selfhost"),
    );
    expect(report.unowned).toEqual([]);
    expect(report.multiOwned).toEqual([]);
    expect(report.globErrors).toEqual([]);
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
      selfhostComposeOutsideModule: [],
    });
  });
});
