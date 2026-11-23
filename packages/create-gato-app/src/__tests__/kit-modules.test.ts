import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { compareNames } from "../compare.js";
import { parseKitModule, readKitModules, withRequired, type KitModule } from "../kit-modules.js";

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

const MANIFESTS: Record<string, unknown> = {
  "core.json": { name: "core", version: "0.10.2", description: "Core", requires: [] },
  "uploads.json": {
    name: "uploads",
    version: "0.2.7",
    description: "Files",
    requires: [],
    files: ["src/features/uploads/**"],
    env: [{ name: "STORAGE_PROVIDER", example: "local" }],
  },
  "api-keys.json": { name: "api-keys", version: "0.1.0", description: "API keys" },
  "needs-demo.json": { name: "needs-demo", description: "Needs demo", requires: ["demo"] },
  "demo.json": { name: "demo" },
};

async function kitWithModules(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-gato-app-modules-"));
  createdDirs.push(dir);
  await mkdir(join(dir, "kit", "modules"), { recursive: true });
  for (const [file, manifest] of Object.entries(MANIFESTS)) {
    await writeFile(join(dir, "kit", "modules", file), JSON.stringify(manifest));
  }
  return dir;
}

const MODULES: KitModule[] = [
  { name: "api-keys", description: "API keys", requires: [] },
  { name: "demo", description: "", requires: [] },
  { name: "needs-demo", description: "Needs demo", requires: ["demo"] },
  { name: "uploads", description: "Files", requires: [] },
];

describe("readKitModules", () => {
  it("zwraca moduły poza core, posortowane po nazwie, tylko z nazwą, opisem i wymaganiami", async () => {
    const dir = await kitWithModules();
    await expect(readKitModules(dir)).resolves.toStrictEqual([
      { name: "api-keys", description: "API keys", requires: [] },
      { name: "demo", description: "", requires: [] },
      { name: "needs-demo", description: "Needs demo", requires: ["demo"] },
      { name: "uploads", description: "Files", requires: [] },
    ]);
  });
});

describe("parseKitModule", () => {
  it("manifest z samą nazwą dostaje pusty opis i brak wymagań", () => {
    expect(parseKitModule({ name: "x" }, "kit/modules/x.json")).toStrictEqual({
      name: "x",
      description: "",
      requires: [],
    });
  });

  it("zachowuje opis i wymagania, odrzuca resztę pól", () => {
    expect(
      parseKitModule(
        { name: "x", description: "X module", requires: ["a", "b"], version: "1.0.0", files: [] },
        "kit/modules/x.json",
      ),
    ).toStrictEqual({ name: "x", description: "X module", requires: ["a", "b"] });
  });

  it.each([
    [null],
    [{}],
    [{ name: 3 }],
    [{ name: "x", requires: "y" }],
    [{ name: "x", requires: [1] }],
    [{ name: "x", description: 5 }],
    ["x"],
    [[]],
  ])("%j nie jest poprawnym manifestem", (raw) => {
    expect(() => parseKitModule(raw, "kit/modules/x.json")).toThrow(
      "kit/modules/x.json is not a valid module manifest",
    );
  });
});

describe("withRequired", () => {
  it("dokłada wymagany moduł i zwraca kolejność listy modułów", () => {
    expect(withRequired(["needs-demo"], MODULES)).toEqual(["demo", "needs-demo"]);
  });

  it("pomija core i zostawia wybrane moduły", () => {
    expect(withRequired(["core", "uploads"], MODULES)).toEqual(["uploads"]);
  });

  it("kolejność wyboru nie zmienia kolejności wyniku", () => {
    expect(withRequired(["uploads", "api-keys"], MODULES)).toEqual(["api-keys", "uploads"]);
  });

  it("powtórzony moduł pojawia się raz", () => {
    expect(withRequired(["uploads", "uploads"], MODULES)).toEqual(["uploads"]);
  });

  it("pusty wybór daje pustą listę", () => {
    expect(withRequired([], MODULES)).toEqual([]);
  });

  it("nieznany moduł jest odrzucony z listą dostępnych", () => {
    expect(() => withRequired(["nope"], MODULES)).toThrow(
      'Unknown module "nope". Available: api-keys, demo, needs-demo, uploads.',
    );
  });

  it("wymagania przechodnie są dołączane", () => {
    const chain: KitModule[] = [
      { name: "base", description: "", requires: [] },
      { name: "middle", description: "", requires: ["base"] },
      { name: "other", description: "", requires: [] },
      { name: "top", description: "", requires: ["middle"] },
    ];
    expect(withRequired(["top"], chain)).toEqual(["base", "middle", "top"]);
  });
});

async function kitWithFiles(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-gato-app-modules-"));
  createdDirs.push(dir);
  await mkdir(join(dir, "kit", "modules"), { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    await writeFile(join(dir, "kit", "modules", file), content);
  }
  return dir;
}

describe("readKitModules: pliki w katalogu", () => {
  it("sortuje po nazwie modułu, nie po nazwie pliku", async () => {
    const dir = await kitWithFiles({
      "a.json": JSON.stringify({ name: "omega" }),
      "z.json": JSON.stringify({ name: "alpha" }),
    });
    expect((await readKitModules(dir)).map((module) => module.name)).toEqual(["alpha", "omega"]);
  });

  it("pomija pliki, które nie są .json", async () => {
    const dir = await kitWithFiles({
      "uploads.json": JSON.stringify({ name: "uploads" }),
      "README.md": "# modules",
      ".DS_Store": "\u0000\u0001",
    });
    await expect(readKitModules(dir)).resolves.toEqual([{ name: "uploads", description: "", requires: [] }]);
  });

  it("uszkodzony JSON jest niepoprawnym manifestem ze ścieżką pliku", async () => {
    const dir = await kitWithFiles({ "broken.json": "{ not json" });
    await expect(readKitModules(dir)).rejects.toThrow("kit/modules/broken.json is not a valid module manifest");
  });
});

describe("parseKitModule: granice", () => {
  it("pusta nazwa jest odrzucona", () => {
    expect(() => parseKitModule({ name: "" }, "kit/modules/x.json")).toThrow(
      "kit/modules/x.json is not a valid module manifest",
    );
  });

  it("wymaganie core i innego modułu jest przyjęte", () => {
    expect(parseKitModule({ name: "x", requires: ["core", "demo"] }, "kit/modules/x.json")).toEqual({
      name: "x",
      description: "",
      requires: ["core", "demo"],
    });
  });
});

describe("withRequired: cykl", () => {
  it("wzajemne wymagania kończą się i dają oba moduły", () => {
    const cycle: KitModule[] = [
      { name: "a", description: "", requires: ["b"] },
      { name: "b", description: "", requires: ["a"] },
    ];
    expect(withRequired(["a"], cycle)).toEqual(["a", "b"]);
  });
});

describe("compareNames", () => {
  it("porządkuje nazwy modułów alfabetycznie", () => {
    expect(compareNames("alpha", "omega")).toBeLessThan(0);
    expect(compareNames("omega", "alpha")).toBeGreaterThan(0);
    expect(compareNames("api-keys", "api-keys")).toBe(0);
    expect(compareNames("demo", "needs-demo")).toBeLessThan(0);
    expect(["uploads", "api-keys", "needs-demo", "demo"].sort(compareNames)).toEqual([
      "api-keys",
      "demo",
      "needs-demo",
      "uploads",
    ]);
  });

  test.prop([fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/)])(
    "jest antysymetryczne i zero tylko dla równych nazw",
    (a, b) => {
      expect(Math.sign(compareNames(a, b)) + Math.sign(compareNames(b, a))).toBe(0);
      expect(compareNames(a, b) === 0).toBe(a === b);
    },
  );
});

describe("withRequired: wymaganie core", () => {
  it("wymaganie core jest pomijane, a pozostałe dołączane bez błędu", () => {
    expect(
      withRequired(
        ["x"],
        [
          { name: "demo", description: "", requires: [] },
          { name: "x", description: "", requires: ["core", "demo"] },
        ],
      ),
    ).toEqual(["demo", "x"]);
  });
});
