import { describe, expect, it } from "vitest";
import { planReport } from "../report.js";
import type { PlanAction, PlannedFile } from "../plan.js";

function warningFor(count: number): string | undefined {
  const lines = planReport({
    plan: {
      files: [],
      mismatchedBase: Array.from({ length: count }, (_, index) => `f${index}`),
    },
    from: "0.1.0",
    to: "0.2.0",
    dryRun: false,
  });
  return lines.find((line) => line.startsWith("Warning:"));
}

describe("planReport: linia Uwaga", () => {
  it("bez plików różnych od tagu nie ma linii Uwaga", () => {
    expect(warningFor(0)).toBeUndefined();
  });

  it("1 plik dostaje liczbę pojedynczą i zaimek it", () => {
    expect(warningFor(1)).toBe(
      "Warning: 1 file differs from the v0.1.0 tag; treated it as changed in the project",
    );
  });

  it.each([2, 4, 5, 11, 22, 112])(
    "%i plików dostaje liczbę mnogą i zaimek them",
    (count) => {
      expect(warningFor(count)).toBe(
        `Warning: ${count} files differ from the v0.1.0 tag; treated them as changed in the project`,
      );
    },
  );

  it("cały raport dla 2 plików: nagłówek, brak zmian i Uwaga", () => {
    expect(
      planReport({
        plan: { files: [], mismatchedBase: ["a", "b"] },
        from: "0.1.0",
        to: "0.2.0",
        dryRun: true,
      }),
    ).toEqual([
      "Update plan for GatoJS 0.1.0 → 0.2.0 (project not changed)",
      "  no file changes",
      "Warning: 2 files differ from the v0.1.0 tag; treated them as changed in the project",
    ]);
  });
});

function planned(path: string, action: PlanAction): PlannedFile {
  return { path, action, reason: null, content: null, mode: null };
}

describe("planReport: kolejność linii", () => {
  it("pliki jednej akcji podane nie po kolei trafiają do raportu posortowane po ścieżce w porządku punktów kodowych", () => {
    expect(
      planReport({
        plan: {
          files: [
            planned("src/z.ts", "added"),
            planned("src/y.ts", "updated"),
            planned("src/a.ts", "added"),
            planned("src/c.ts", "updated"),
            planned("src/B.ts", "added"),
          ],
          mismatchedBase: [],
        },
        from: "0.1.0",
        to: "0.2.0",
        dryRun: true,
      }),
    ).toEqual([
      "Update plan for GatoJS 0.1.0 → 0.2.0 (project not changed)",
      "  updated        src/c.ts",
      "  updated        src/y.ts",
      "  added          src/B.ts",
      "  added          src/a.ts",
      "  added          src/z.ts",
    ]);
  });
});
