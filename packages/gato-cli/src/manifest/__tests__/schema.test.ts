import { describe, expect, it } from "vitest";
import { kitStateSchema, moduleManifestSchema } from "../schema.js";

describe("moduleManifestSchema", () => {
  it("odrzuca manifest bez name", () => {
    expect(moduleManifestSchema.safeParse({ version: "1.0.0" }).success).toBe(
      false,
    );
  });

  it("uzupelnia domyslne wartosci pol opcjonalnych", () => {
    const parsed = moduleManifestSchema.parse({
      name: "uploads",
      version: "1.0.0",
      description: "Uploads",
    });
    expect(parsed).toEqual({
      name: "uploads",
      version: "1.0.0",
      description: "Uploads",
      requires: [],
      files: [],
      dependencies: {},
      devDependencies: {},
      env: [],
      schemaRelations: [],
      compose: null,
      ciSteps: null,
      workspaces: [],
    });
  });

  it("przyjmuje ciSteps jako sciezke pliku", () => {
    const parsed = moduleManifestSchema.parse({
      name: "uploads",
      version: "1.0.0",
      description: "Uploads",
      ciSteps: "ci/uploads.integration-steps.yml",
    });
    expect(parsed.ciSteps).toBe("ci/uploads.integration-steps.yml");
  });

  it("odrzuca ciSteps niebedace tekstem", () => {
    expect(
      moduleManifestSchema.safeParse({
        name: "uploads",
        version: "1.0.0",
        description: "Uploads",
        ciSteps: 5,
      }).success,
    ).toBe(false);
  });
});

describe("kitStateSchema", () => {
  const base = { kitVersion: "0.0.0", modules: {} };

  it("uzupelnia domyslne kitRepo, project i locales", () => {
    expect(kitStateSchema.parse(base)).toEqual({
      kitVersion: "0.0.0",
      kitRepo: "https://github.com/webamigos/wa-kit.git",
      project: { name: "WA App", slug: "wa-app" },
      locales: ["pl", "en"],
      modules: {},
      projectModules: {},
    });
  });

  it.each([[["pl"]], [["pl", "en"]], [["en", "pl"]]])(
    "locales %j sa poprawne",
    (locales) => {
      expect(kitStateSchema.safeParse({ ...base, locales }).success).toBe(true);
    },
  );

  it.each([[["en"]], [[]], [["pl", "de"]], [["pl", "pl"]], [["de"]]])(
    "locales %j konczy sie bledem walidacji",
    (locales) => {
      expect(kitStateSchema.safeParse({ ...base, locales }).success).toBe(
        false,
      );
    },
  );

  it("project wymaga name i slug", () => {
    expect(
      kitStateSchema.safeParse({ ...base, project: { name: "X" } }).success,
    ).toBe(false);
    expect(
      kitStateSchema.safeParse({ ...base, project: { slug: "x" } }).success,
    ).toBe(false);
  });

  it("kitRepo musi byc napisem", () => {
    expect(kitStateSchema.safeParse({ ...base, kitRepo: 5 }).success).toBe(
      false,
    );
  });
});
