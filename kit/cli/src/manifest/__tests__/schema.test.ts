import { describe, expect, it } from "vitest";
import { moduleManifestSchema } from "../schema.js";

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
      workspaces: [],
    });
  });
});
