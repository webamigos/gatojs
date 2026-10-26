import { describe, expect, it } from "vitest";
import { assertE2eDatabase, databaseName } from "../database-guard";

describe("databaseName", () => {
  it("czyta nazwę bazy z URL", () => {
    expect(
      databaseName("postgresql://u:p@localhost:5439/wa_app_e2e?schema=public"),
    ).toBe("wa_app_e2e");
  });
});

describe("assertE2eDatabase", () => {
  it("przepuszcza bazę kończącą się na _e2e", () => {
    expect(() =>
      assertE2eDatabase("postgresql://u:p@localhost:5432/wa_app_e2e"),
    ).not.toThrow();
  });

  it.each([
    "postgresql://u:p@localhost:5432/wa_app",
    "postgresql://u:p@localhost:5432/wa_app_e2e_backup",
    "postgresql://u:p@localhost:5432/",
    "nie-url",
  ])("odrzuca %s", (url) => {
    expect(() => assertE2eDatabase(url)).toThrow(/_e2e/);
  });
});
