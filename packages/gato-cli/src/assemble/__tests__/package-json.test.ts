import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDependencies,
  dependencyConflicts,
  projectPackageJson,
  removeDependencies,
} from "../package-json.js";
import { manifestOf } from "./manifests.js";

const names = { name: "Acme Shop", slug: "acme-shop", snake: "acme_shop" };

describe("projectPackageJson", () => {
  const kitPackageJson = JSON.stringify({
    name: "wa-kit",
    version: "9.9.9",
    scripts: { dev: "next dev" },
    dependencies: {
      next: "^16.0.0",
      "left-pad": "^1.3.0",
      "kit-only": "1.0.0",
    },
    devDependencies: { vitest: "^4.0.0", "dev-only": "1.0.0" },
  });

  it("sklada zaleznosci z manifestow, nazwe i wersje projektu", () => {
    const out = projectPackageJson(
      kitPackageJson,
      [
        manifestOf("core", { dependencies: { next: "^16.0.0" } }),
        manifestOf("demo", { dependencies: { "left-pad": "^1.3.0" } }),
      ],
      names,
    );
    expect(out).toBe(
      `${JSON.stringify(
        {
          name: "acme-shop",
          version: "0.1.0",
          scripts: { dev: "next dev" },
          dependencies: { "left-pad": "^1.3.0", next: "^16.0.0" },
          devDependencies: {},
        },
        null,
        2,
      )}\n`,
    );
  });

  it("klucze zaleznosci sa posortowane", () => {
    const out = JSON.parse(
      projectPackageJson(
        kitPackageJson,
        [
          manifestOf("core", { dependencies: { next: "^16.0.0" } }),
          manifestOf("demo", { dependencies: { "left-pad": "^1.3.0" } }),
        ],
        names,
      ),
    );
    expect(Object.keys(out.dependencies)).toEqual(["left-pad", "next"]);
  });

  it("devDependencies z manifestow sa sumowane i sortowane, bez zaleznosci spoza manifestow", () => {
    const out = JSON.parse(
      projectPackageJson(
        kitPackageJson,
        [
          manifestOf("core", { devDependencies: { vitest: "^4.0.0" } }),
          manifestOf("demo", { devDependencies: { aaa: "1.0.0" } }),
        ],
        names,
      ),
    );
    expect(Object.keys(out.devDependencies)).toEqual(["aaa", "vitest"]);
    expect(out.devDependencies).toEqual({ aaa: "1.0.0", vitest: "^4.0.0" });
  });

  it("brak zaleznosci dev w manifestach daje pusty obiekt", () => {
    const out = JSON.parse(
      projectPackageJson(kitPackageJson, [manifestOf("core")], names),
    );
    expect(out.devDependencies).toEqual({});
    expect(out.dependencies).toEqual({});
  });

  it("konczy sie nowa linia i uzywa wciecia 2", () => {
    const out = projectPackageJson(kitPackageJson, [manifestOf("core")], names);
    expect(out.endsWith("}\n")).toBe(true);
    expect(out).toContain('\n  "name": "acme-shop",');
  });
});

describe("addDependencies", () => {
  it("dopisuje brakujace zaleznosci i sortuje klucze", () => {
    const pkg = JSON.stringify({ dependencies: { zod: "^4.3.6" } });
    const out = JSON.parse(
      addDependencies(
        pkg,
        manifestOf("demo", { dependencies: { "left-pad": "^1.3.0" } }),
      ),
    );
    expect(out.dependencies).toEqual({ "left-pad": "^1.3.0", zod: "^4.3.6" });
    expect(Object.keys(out.dependencies)).toEqual(["left-pad", "zod"]);
  });

  it("zaleznosc podbita w projekcie zostaje w wersji projektu", () => {
    const pkg = JSON.stringify({ dependencies: { zod: "^4.4.0" } });
    const out = JSON.parse(
      addDependencies(
        pkg,
        manifestOf("demo", { dependencies: { zod: "^4.3.6" } }),
      ),
    );
    expect(out.dependencies).toEqual({ zod: "^4.4.0" });
  });

  it("dopisuje devDependencies bez nadpisywania wersji projektu", () => {
    const pkg = JSON.stringify({
      name: "p",
      devDependencies: { vitest: "^5.0.0" },
    });
    const out = JSON.parse(
      addDependencies(
        pkg,
        manifestOf("demo", {
          devDependencies: { vitest: "^4.0.0", tsx: "^4.0.0" },
        }),
      ),
    );
    expect(out.devDependencies).toEqual({ tsx: "^4.0.0", vitest: "^5.0.0" });
    expect(out.name).toBe("p");
  });

  it("wynik ma wciecie 2 i koncowa nowa linie", () => {
    const out = addDependencies(
      JSON.stringify({ dependencies: {} }),
      manifestOf("demo", { dependencies: { a: "1.0.0" } }),
    );
    expect(out).toBe('{\n  "dependencies": {\n    "a": "1.0.0"\n  }\n}\n');
  });

  it("tworzy sekcje dependencies, gdy projekt jej nie ma", () => {
    const out = JSON.parse(
      addDependencies(
        "{}",
        manifestOf("demo", { dependencies: { a: "1.0.0" } }),
      ),
    );
    expect(out.dependencies).toEqual({ a: "1.0.0" });
  });
});

describe("removeDependencies", () => {
  it("zostawia zaleznosci wspoldzielone i reczne", () => {
    const pkg = JSON.stringify({
      dependencies: { "left-pad": "^1.3.0", zod: "^4.3.6", own: "1.0.0" },
    });
    const out = JSON.parse(
      removeDependencies(
        pkg,
        manifestOf("demo", {
          dependencies: { "left-pad": "^1.3.0", zod: "^4.3.6" },
        }),
        [manifestOf("core", { dependencies: { zod: "^4.3.6" } })],
      ),
    );
    expect(out.dependencies).toEqual({ own: "1.0.0", zod: "^4.3.6" });
  });

  it("nie usuwa zaleznosci spoza removed", () => {
    const pkg = JSON.stringify({
      dependencies: { a: "1.0.0", b: "1.0.0", c: "1.0.0" },
    });
    const out = JSON.parse(
      removeDependencies(
        pkg,
        manifestOf("demo", { dependencies: { a: "1.0.0" } }),
        [],
      ),
    );
    expect(out.dependencies).toEqual({ b: "1.0.0", c: "1.0.0" });
  });

  it("usuwa devDependencies removed, ktorych nie deklaruje remaining", () => {
    const pkg = JSON.stringify({
      devDependencies: { tsx: "^4.0.0", vitest: "^4.0.0", own: "1.0.0" },
    });
    const out = JSON.parse(
      removeDependencies(
        pkg,
        manifestOf("demo", {
          devDependencies: { tsx: "^4.0.0", vitest: "^4.0.0" },
        }),
        [manifestOf("core", { devDependencies: { vitest: "^4.0.0" } })],
      ),
    );
    expect(out.devDependencies).toEqual({ own: "1.0.0", vitest: "^4.0.0" });
  });

  it("zaleznosc wspoldzielona przez dowolny z remaining zostaje", () => {
    const pkg = JSON.stringify({ dependencies: { a: "1.0.0", b: "1.0.0" } });
    const out = JSON.parse(
      removeDependencies(
        pkg,
        manifestOf("demo", { dependencies: { a: "1.0.0", b: "1.0.0" } }),
        [
          manifestOf("core"),
          manifestOf("x", { dependencies: { a: "1.0.0" } }),
          manifestOf("y", { dependencies: { b: "1.0.0" } }),
        ],
      ),
    );
    expect(out.dependencies).toEqual({ a: "1.0.0", b: "1.0.0" });
  });

  it("wynik ma wciecie 2 i koncowa nowa linie", () => {
    const out = removeDependencies(
      JSON.stringify({ name: "p", dependencies: { a: "1.0.0", b: "1.0.0" } }),
      manifestOf("demo", { dependencies: { a: "1.0.0" } }),
      [],
    );
    expect(out).toBe(
      '{\n  "name": "p",\n  "dependencies": {\n    "b": "1.0.0"\n  }\n}\n',
    );
  });
});

describe("dependencyConflicts", () => {
  it("zwraca zależność z inną wersją w tej samej sekcji", () => {
    const pkg = JSON.stringify({ dependencies: { zod: "^3" } });
    expect(
      dependencyConflicts(
        pkg,
        manifestOf("demo", { dependencies: { zod: "^4" } }),
      ),
    ).toEqual([
      { section: "dependencies", name: "zod", project: "^3", module: "^4" },
    ]);
  });

  it("zwraca konflikt w devDependencies z nazwą sekcji", () => {
    const pkg = JSON.stringify({ devDependencies: { tsx: "^3.0.0" } });
    expect(
      dependencyConflicts(
        pkg,
        manifestOf("demo", { devDependencies: { tsx: "^4.0.0" } }),
      ),
    ).toEqual([
      {
        section: "devDependencies",
        name: "tsx",
        project: "^3.0.0",
        module: "^4.0.0",
      },
    ]);
  });

  it("ta sama wersja nie jest konfliktem", () => {
    const pkg = JSON.stringify({
      dependencies: { zod: "^4" },
      devDependencies: { tsx: "^4.0.0" },
    });
    expect(
      dependencyConflicts(
        pkg,
        manifestOf("demo", {
          dependencies: { zod: "^4" },
          devDependencies: { tsx: "^4.0.0" },
        }),
      ),
    ).toEqual([]);
  });

  it("zależność nieobecna w projekcie nie jest konfliktem", () => {
    const pkg = JSON.stringify({ dependencies: { next: "^16.0.0" } });
    expect(
      dependencyConflicts(
        pkg,
        manifestOf("demo", { dependencies: { zod: "^4" } }),
      ),
    ).toEqual([]);
  });

  it("projekt bez sekcji nie ma konfliktów", () => {
    expect(
      dependencyConflicts(
        "{}",
        manifestOf("demo", {
          dependencies: { zod: "^4" },
          devDependencies: { tsx: "^4.0.0" },
        }),
      ),
    ).toEqual([]);
  });

  it("zależność w innej sekcji projektu nie jest konfliktem", () => {
    const pkg = JSON.stringify({
      dependencies: { tsx: "^3.0.0" },
      devDependencies: { zod: "^3" },
    });
    expect(
      dependencyConflicts(
        pkg,
        manifestOf("demo", {
          dependencies: { zod: "^4" },
          devDependencies: { tsx: "^4.0.0" },
        }),
      ),
    ).toEqual([]);
  });

  it("manifest bez zależności daje pustą listę", () => {
    const pkg = JSON.stringify({
      dependencies: { zod: "^3" },
      devDependencies: { tsx: "^3.0.0" },
    });
    expect(dependencyConflicts(pkg, manifestOf("demo"))).toEqual([]);
  });

  it("sortuje po sekcji, potem po nazwie", () => {
    const pkg = JSON.stringify({
      dependencies: { zeta: "1.0.0", alpha: "1.0.0", mid: "1.0.0" },
      devDependencies: { aaa: "1.0.0", bbb: "1.0.0" },
    });
    expect(
      dependencyConflicts(
        pkg,
        manifestOf("demo", {
          dependencies: { mid: "2.0.0", zeta: "2.0.0", alpha: "2.0.0" },
          devDependencies: { bbb: "2.0.0", aaa: "2.0.0" },
        }),
      ),
    ).toEqual([
      {
        section: "dependencies",
        name: "alpha",
        project: "1.0.0",
        module: "2.0.0",
      },
      {
        section: "dependencies",
        name: "mid",
        project: "1.0.0",
        module: "2.0.0",
      },
      {
        section: "dependencies",
        name: "zeta",
        project: "1.0.0",
        module: "2.0.0",
      },
      {
        section: "devDependencies",
        name: "aaa",
        project: "1.0.0",
        module: "2.0.0",
      },
      {
        section: "devDependencies",
        name: "bbb",
        project: "1.0.0",
        module: "2.0.0",
      },
    ]);
  });

  it("zwraca tylko zależności z różną wersją, pomija zgodne", () => {
    const pkg = JSON.stringify({
      dependencies: { a: "1.0.0", b: "1.0.0", c: "1.0.0" },
    });
    expect(
      dependencyConflicts(
        pkg,
        manifestOf("demo", {
          dependencies: { a: "1.0.0", b: "2.0.0", c: "1.0.0" },
        }),
      ),
    ).toEqual([
      { section: "dependencies", name: "b", project: "1.0.0", module: "2.0.0" },
    ]);
  });

  test.prop([
    fc.dictionary(
      fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
      fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
      { maxKeys: 8 },
    ),
    fc.dictionary(
      fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
      fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
      { maxKeys: 8 },
    ),
  ])(
    "identyczne zależności projektu i modułu nie dają konfliktów",
    (deps, devDeps) => {
      const pkg = JSON.stringify({
        dependencies: deps,
        devDependencies: devDeps,
      });
      expect(
        dependencyConflicts(
          pkg,
          manifestOf("demo", { dependencies: deps, devDependencies: devDeps }),
        ),
      ).toEqual([]);
    },
  );
});
