import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  kitConfigSchema,
  readKitConfig,
  readKitManifests,
} from "../kit-config.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../__tests__/fixtures",
);
const fixtureKit = join(fixturesDir, "kit");
const badKit = join(fixturesDir, "kit-bad-name");

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "wa-kit-config-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("readKitConfig", () => {
  it("czyta kit/kit.json z fixture", async () => {
    const config = await readKitConfig(fixtureKit);
    expect(config.version).toBe("0.1.0");
    expect(config.repo).toBe("https://github.com/webamigos/wa-kit.git");
    expect(config.placeholders).toEqual({
      projectName: "WA App",
      projectSlug: "wa-app",
      projectSnake: "wa_app",
    });
    expect(config.managedFiles).toEqual(["package.json", "package-lock.json"]);
    expect(config.generatedFiles).toEqual([
      "src/modules.generated.ts",
      "src/modules.client.generated.ts",
      "src/i18n/locales.generated.ts",
    ]);
    expect(config.kitOnly).toHaveLength(8);
    expect(config.placeholderFiles).toHaveLength(10);
  });

  it("brak kit/kit.json zglasza katalog i to, ze to nie repozytorium wa-kit", async () => {
    await expect(readKitConfig(tmp)).rejects.toThrow(
      `Brak kit/kit.json w ${tmp} — to nie jest repozytorium wa-kit`,
    );
  });

  it("plik bez placeholderFiles konczy sie bledem walidacji", async () => {
    const raw = JSON.parse(
      await readFile(join(fixtureKit, "kit/kit.json"), "utf8"),
    );
    delete raw.placeholderFiles;
    await mkdir(join(tmp, "kit"), { recursive: true });
    await writeFile(join(tmp, "kit/kit.json"), JSON.stringify(raw));
    await expect(readKitConfig(tmp)).rejects.toThrow();
  });

  it("plik bez placeholders konczy sie bledem walidacji", async () => {
    const raw = JSON.parse(
      await readFile(join(fixtureKit, "kit/kit.json"), "utf8"),
    );
    delete raw.placeholders;
    await mkdir(join(tmp, "kit"), { recursive: true });
    await writeFile(join(tmp, "kit/kit.json"), JSON.stringify(raw));
    await expect(readKitConfig(tmp)).rejects.toThrow();
  });

  it("blad inny niz brak pliku nie jest maskowany", async () => {
    await mkdir(join(tmp, "kit/kit.json"), { recursive: true });
    const error = await readKitConfig(tmp).then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toContain("EISDIR");
    expect(error?.message).not.toContain("Brak kit/kit.json");
  });

  it("niepoprawny typ wersji odrzucony przez kitConfigSchema", () => {
    expect(kitConfigSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});

describe("readKitManifests", () => {
  it("ignoruje pliki spoza .json w kit/modules", async () => {
    const copy = join(tmp, "kit-copy");
    await cp(fixtureKit, copy, { recursive: true });
    await writeFile(join(copy, "kit/modules/README.md"), "# modules");
    const manifests = await readKitManifests(copy);
    expect(manifests.map((m) => m.name)).toEqual([
      "core",
      "demo",
      "needs-demo",
    ]);
  });

  it("core pierwszy, potem alfabetycznie mimo innej kolejnosci plikow", async () => {
    expect((await readKitManifests(fixtureKit)).map((m) => m.name)).toEqual([
      "core",
      "demo",
      "needs-demo",
    ]);
  });

  it("core pozostaje pierwszy, gdy inny modul sortuje sie alfabetycznie przed nim", async () => {
    await cp(fixtureKit, tmp, { recursive: true });
    await writeFile(
      join(tmp, "kit/modules/alpha.json"),
      JSON.stringify({ name: "alpha", version: "0.5.0", description: "Alpha" }),
    );
    expect((await readKitManifests(tmp)).map((m) => m.name)).toEqual([
      "core",
      "alpha",
      "demo",
      "needs-demo",
    ]);
  });

  it("zwraca pola manifestu z domyslnymi wartosciami", async () => {
    const [core, demo] = await readKitManifests(fixtureKit);
    expect(core?.requires).toEqual([]);
    expect(core?.version).toBe("0.2.0");
    expect(demo?.dependencies).toEqual({ "left-pad": "^1.3.0" });
    expect(demo?.env).toEqual([
      { name: "DEMO_TOKEN", example: "{{projectSlug}}_demo_" },
    ]);
    expect(demo?.schemaRelations).toEqual([
      { model: "User", field: "demos Demo[]" },
    ]);
    expect(demo?.compose).toBe("src/features/demo/compose.yml");
  });

  it("name rozne od nazwy pliku zglasza blad z nazwa pliku", async () => {
    await expect(readKitManifests(badKit)).rejects.toThrow(
      'kit/modules/demo.json: name "inny" nie zgadza się z nazwą pliku',
    );
  });
});
