import { describe, expect, it } from "vitest";
import { moduleFiles, resolveModules } from "../resolve-modules.js";
import { manifestOf } from "./manifests.js";

const fixtureManifests = [
  manifestOf("core"),
  manifestOf("demo"),
  manifestOf("needs-demo", { requires: ["demo"] }),
];

const names = (list: { name: string }[]) => list.map((m) => m.name);

describe("resolveModules", () => {
  it("requires przechodnie i core zawsze", () => {
    expect(names(resolveModules(["needs-demo"], fixtureManifests))).toEqual([
      "core",
      "demo",
      "needs-demo",
    ]);
  });

  it("pusta lista daje samo core", () => {
    expect(names(resolveModules([], fixtureManifests))).toEqual(["core"]);
  });

  it("core podany wprost nie jest zdublowany", () => {
    expect(names(resolveModules(["core"], fixtureManifests))).toEqual(["core"]);
  });

  it("powtorzony modul pojawia sie raz", () => {
    expect(names(resolveModules(["demo", "demo"], fixtureManifests))).toEqual([
      "core",
      "demo",
    ]);
  });

  it("modul zadany i wymagany przez inny pojawia sie raz", () => {
    expect(
      names(resolveModules(["needs-demo", "demo"], fixtureManifests)),
    ).toEqual(["core", "demo", "needs-demo"]);
  });

  it("kolejnosc: core, potem alfabetycznie niezaleznie od kolejnosci zadania", () => {
    const manifests = [
      manifestOf("core"),
      manifestOf("zeta"),
      manifestOf("alpha"),
      manifestOf("mid"),
    ];
    expect(names(resolveModules(["zeta", "mid", "alpha"], manifests))).toEqual([
      "core",
      "alpha",
      "mid",
      "zeta",
    ]);
  });

  it("requires rozwijane na wiele poziomow", () => {
    const manifests = [
      manifestOf("core"),
      manifestOf("a"),
      manifestOf("b", { requires: ["a"] }),
      manifestOf("c", { requires: ["b"] }),
      manifestOf("d", { requires: ["c"] }),
    ];
    expect(names(resolveModules(["d"], manifests))).toEqual([
      "core",
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("zwraca manifesty z listy dostepnych", () => {
    const resolved = resolveModules(["demo"], fixtureManifests);
    expect(resolved[1]).toBe(fixtureManifests[1]);
  });

  it("literowka zwraca liste dostepnych bez core, alfabetycznie", () => {
    expect(() => resolveModules(["dem"], fixtureManifests)).toThrow(
      "Nieznany moduł: dem. Dostępne: demo, needs-demo",
    );
  });

  it("lista dostepnych jest posortowana niezaleznie od kolejnosci wejscia", () => {
    const manifests = [
      manifestOf("zeta"),
      manifestOf("core"),
      manifestOf("alpha"),
    ];
    expect(() => resolveModules(["nope"], manifests)).toThrow(
      "Nieznany moduł: nope. Dostępne: alpha, zeta",
    );
  });

  it("nieznany modul w requires jest bledem a nie pomijany", () => {
    const manifests = [
      manifestOf("core"),
      manifestOf("demo"),
      manifestOf("broken", { requires: ["ghost"] }),
    ];
    expect(() => resolveModules(["broken"], manifests)).toThrow(
      "Nieznany moduł: ghost. Dostępne: broken, demo",
    );
  });

  it("nieznany modul gleboko w lancuchu requires jest bledem", () => {
    const manifests = [
      manifestOf("core"),
      manifestOf("a", { requires: ["b"] }),
      manifestOf("b", { requires: ["ghost"] }),
    ];
    expect(() => resolveModules(["a"], manifests)).toThrow(
      "Nieznany moduł: ghost. Dostępne: a, b",
    );
  });

  it("pierwszy nieznany modul w kolejnosci wejscia jest zglaszany", () => {
    expect(() => resolveModules(["zly1", "zly2"], fixtureManifests)).toThrow(
      "Nieznany moduł: zly1.",
    );
  });

  it("cykl w requires konczy sie i daje kazdy modul raz", () => {
    const manifests = [
      manifestOf("core"),
      manifestOf("a", { requires: ["b"] }),
      manifestOf("b", { requires: ["a"] }),
    ];
    expect(names(resolveModules(["a"], manifests))).toEqual(["core", "a", "b"]);
  });
});

describe("moduleFiles", () => {
  it("zwraca pliki pasujace do globow manifestu, posortowane", () => {
    const manifest = manifestOf("demo", { files: ["src/features/demo/**"] });
    expect(
      moduleFiles(manifest, [
        "src/features/demo/b.ts",
        "src/features/other/x.ts",
        "src/features/demo/a.ts",
      ]),
    ).toEqual(["src/features/demo/a.ts", "src/features/demo/b.ts"]);
  });

  it("manifest bez globow nie ma plikow", () => {
    expect(moduleFiles(manifestOf("core"), ["a.ts"])).toEqual([]);
  });
});
