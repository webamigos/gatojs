import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeKitRepo, removeTempDirs } from "../../__tests__/helpers.js";
import { checkOwnership } from "../ownership.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../../../..");

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
