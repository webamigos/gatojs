import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDependencies,
  dependencyConflicts,
  projectPackageJson,
  removeDependencies,
  withCliDependency,
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

describe("withCliDependency", () => {
  it("null returns the input byte for byte, even when it is not formatted", () => {
    const input =
      '{"name":"acme",  "devDependencies":{"zod":"^4","eslint":"^9"}}';
    expect(withCliDependency(input, null)).toBe(input);
  });

  it("null keeps a formatted file with its trailing newline untouched", () => {
    const input = '{\n    "name": "acme"\n}\n';
    expect(withCliDependency(input, null)).toBe(input);
  });

  it("a caret version is added to devDependencies in sorted order", () => {
    const input = `${JSON.stringify(
      {
        name: "acme",
        scripts: { dev: "next dev" },
        dependencies: { next: "^16.0.0" },
        devDependencies: { eslint: "^9", zod: "^4" },
      },
      null,
      2,
    )}\n`;
    expect(withCliDependency(input, "^0.2.0")).toBe(
      [
        "{",
        '  "name": "acme",',
        '  "scripts": {',
        '    "dev": "next dev"',
        "  },",
        '  "dependencies": {',
        '    "next": "^16.0.0"',
        "  },",
        '  "devDependencies": {',
        '    "eslint": "^9",',
        '    "gato-cli": "^0.2.0",',
        '    "zod": "^4"',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("devDependencies are sorted by code point, not by locale", () => {
    const input = JSON.stringify({
      devDependencies: { zod: "^4", "@types/node": "^22", Zeta: "1.0.0" },
    });
    const out = JSON.parse(withCliDependency(input, "^0.2.0")) as {
      devDependencies: Record<string, string>;
    };
    expect(Object.keys(out.devDependencies)).toEqual([
      "@types/node",
      "Zeta",
      "gato-cli",
      "zod",
    ]);
  });

  it("an unsorted input is sorted on output", () => {
    const input = JSON.stringify({
      devDependencies: { zod: "^4", eslint: "^9" },
    });
    const out = JSON.parse(withCliDependency(input, "^0.2.0")) as {
      devDependencies: Record<string, string>;
    };
    expect(Object.keys(out.devDependencies)).toEqual([
      "eslint",
      "gato-cli",
      "zod",
    ]);
  });

  it("missing devDependencies are created with gato-cli only", () => {
    const input = JSON.stringify({
      name: "acme",
      dependencies: { next: "^16.0.0" },
    });
    const out = withCliDependency(input, "^0.2.0");
    expect(JSON.parse(out)).toEqual({
      name: "acme",
      dependencies: { next: "^16.0.0" },
      devDependencies: { "gato-cli": "^0.2.0" },
    });
    expect(out.endsWith("}\n")).toBe(true);
    expect(out).toContain(
      '\n  "devDependencies": {\n    "gato-cli": "^0.2.0"\n  }',
    );
  });

  it("an existing gato-cli value is replaced", () => {
    const input = JSON.stringify({
      devDependencies: { "gato-cli": "^0.1.0", vitest: "^4" },
    });
    expect(
      JSON.parse(withCliDependency(input, "file:/t/gato-cli-0.2.0.tgz")),
    ).toEqual({
      devDependencies: {
        "gato-cli": "file:/t/gato-cli-0.2.0.tgz",
        vitest: "^4",
      },
    });
  });

  it("dependencies and other fields are left as they were", () => {
    const input = JSON.stringify({
      name: "acme",
      version: "0.1.0",
      private: true,
      dependencies: { zod: "^4", next: "^16.0.0" },
      devDependencies: {},
    });
    const out = JSON.parse(withCliDependency(input, "^0.2.0")) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({
      name: "acme",
      version: "0.1.0",
      private: true,
      dependencies: { zod: "^4", next: "^16.0.0" },
      devDependencies: { "gato-cli": "^0.2.0" },
    });
    expect(Object.keys(out.dependencies as object)).toEqual(["zod", "next"]);
    expect(Object.keys(out)).toEqual([
      "name",
      "version",
      "private",
      "dependencies",
      "devDependencies",
    ]);
  });

  const packageName = fc.stringMatching(/^[a-z][a-z0-9-]{0,9}$/);
  const packageJson = fc.record({
    name: packageName,
    devDependencies: fc.dictionary(packageName, fc.constant("^1.0.0")),
  });

  test.prop([packageJson, fc.integer({ min: 0, max: 6 })])(
    "null never changes the text",
    (value, indent) => {
      const input = JSON.stringify(value, null, indent);
      expect(withCliDependency(input, null)).toBe(input);
    },
  );

  test.prop([packageJson])(
    "a value is set, keys ascend and output is two-space JSON with a newline",
    (value) => {
      const out = withCliDependency(JSON.stringify(value), "^0.2.0");
      const parsed = JSON.parse(out) as {
        name: string;
        devDependencies: Record<string, string>;
      };
      expect(parsed.name).toBe(value.name);
      expect(parsed.devDependencies["gato-cli"]).toBe("^0.2.0");
      const keys = Object.keys(parsed.devDependencies);
      for (let index = 1; index < keys.length; index += 1) {
        expect((keys[index - 1] as string) < (keys[index] as string)).toBe(
          true,
        );
      }
      expect(out).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
    },
  );
});
