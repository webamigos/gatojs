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
      selfhostCompose: null,
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

describe("moduleManifestSchema: generate w env", () => {
  const base = { name: "demo", version: "1.0.0", description: "Demo" };

  it.each([["secret-32"], ["secret-64"], ["hex-32"]])(
    "zmienna z generate %s jest poprawna i zachowuje pole",
    (generate) => {
      const parsed = moduleManifestSchema.parse({
        ...base,
        env: [{ name: "DEMO_SECRET", example: "x", generate }],
      });
      expect(parsed.env).toEqual([
        { name: "DEMO_SECRET", example: "x", generate },
      ]);
    },
  );

  it("zmienna bez generate nie dostaje tego pola", () => {
    const parsed = moduleManifestSchema.parse({
      ...base,
      env: [{ name: "DEMO_TOKEN", example: "t" }],
    });
    expect(parsed.env).toEqual([{ name: "DEMO_TOKEN", example: "t" }]);
  });

  it.each([["secret-16"], ["hex-64"], [""], [32], [true]])(
    "generate %j konczy sie bledem walidacji",
    (generate) => {
      expect(
        moduleManifestSchema.safeParse({
          ...base,
          env: [{ name: "DEMO_SECRET", example: "x", generate }],
        }).success,
      ).toBe(false);
    },
  );
});

describe("moduleManifestSchema: self-host fields", () => {
  const base = { name: "x", version: "0.1.0", description: "" };

  it("defaults selfhostCompose to null", () => {
    expect(moduleManifestSchema.parse(base).selfhostCompose).toBeNull();
  });

  it("keeps selfhostCompose as a file path", () => {
    expect(
      moduleManifestSchema.parse({ ...base, selfhostCompose: "docker/x.yml" })
        .selfhostCompose,
    ).toBe("docker/x.yml");
  });

  it("keeps an explicit selfhostCompose null", () => {
    expect(
      moduleManifestSchema.parse({ ...base, selfhostCompose: null })
        .selfhostCompose,
    ).toBeNull();
  });

  it("rejects a selfhostCompose that is not a string", () => {
    expect(
      moduleManifestSchema.safeParse({ ...base, selfhostCompose: 5 }).success,
    ).toBe(false);
  });

  it("an env item without selfhostExample parses unchanged, without the key", () => {
    const parsed = moduleManifestSchema.parse({
      ...base,
      env: [{ name: "A", example: "1" }],
    });
    expect(parsed.env).toEqual([{ name: "A", example: "1" }]);
    expect(Object.keys(parsed.env[0] ?? {})).toEqual(["name", "example"]);
  });

  it("keeps a non-empty selfhostExample", () => {
    expect(
      moduleManifestSchema.parse({
        ...base,
        env: [{ name: "A", example: "1", selfhostExample: "2" }],
      }).env,
    ).toEqual([{ name: "A", example: "1", selfhostExample: "2" }]);
  });

  it("keeps an empty selfhostExample", () => {
    const parsed = moduleManifestSchema.parse({
      ...base,
      env: [{ name: "A", example: "1", selfhostExample: "" }],
    });
    expect(parsed.env[0]).toHaveProperty("selfhostExample", "");
  });

  it("rejects a selfhostExample that is not a string", () => {
    expect(
      moduleManifestSchema.safeParse({
        ...base,
        env: [{ name: "A", example: "1", selfhostExample: 5 }],
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
      kitFormat: 1,
      locales: ["pl", "en"],
      modules: {},
      projectModules: {},
      ejected: {},
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

  it("keeps an explicit kitFormat 2", () => {
    expect(kitStateSchema.parse({ ...base, kitFormat: 2 }).kitFormat).toBe(2);
  });

  it.each([[0], [-1], [1.5], ["1"]])(
    "kitFormat %j is rejected",
    (kitFormat) => {
      expect(kitStateSchema.safeParse({ ...base, kitFormat }).success).toBe(
        false,
      );
    },
  );

  it("keeps an ejected entry with its reason and date", () => {
    expect(
      kitStateSchema.parse({
        ...base,
        ejected: {
          "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
        },
      }).ejected,
    ).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
    });
  });

  it("trims the reason of an ejected entry", () => {
    expect(
      kitStateSchema.parse({
        ...base,
        ejected: {
          "src/a.ts": { reason: "  custom login  ", ejectedAt: "2026-11-23" },
        },
      }).ejected,
    ).toEqual({
      "src/a.ts": { reason: "custom login", ejectedAt: "2026-11-23" },
    });
  });

  it("rejects an ejected entry with a blank reason", () => {
    expect(
      kitStateSchema.safeParse({
        ...base,
        ejected: { x: { reason: "  ", ejectedAt: "2026-11-23" } },
      }).success,
    ).toBe(false);
  });

  it("rejects an ejected entry with an empty reason", () => {
    expect(
      kitStateSchema.safeParse({
        ...base,
        ejected: { x: { reason: "", ejectedAt: "2026-11-23" } },
      }).success,
    ).toBe(false);
  });

  it("rejects an ejected entry without ejectedAt", () => {
    expect(
      kitStateSchema.safeParse({
        ...base,
        ejected: { x: { reason: "custom login" } },
      }).success,
    ).toBe(false);
  });

  it("rejects an ejected entry without a reason", () => {
    expect(
      kitStateSchema.safeParse({
        ...base,
        ejected: { x: { ejectedAt: "2026-11-23" } },
      }).success,
    ).toBe(false);
  });
});
