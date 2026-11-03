import { describe, expect, it } from "vitest";
import { planReport } from "../report.js";

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
  return lines.find((line) => line.startsWith("Uwaga:"));
}

describe("planReport: linia Uwaga", () => {
  it("bez plików różnych od tagu nie ma linii Uwaga", () => {
    expect(warningFor(0)).toBeUndefined();
  });

  it("1 plik dostaje liczbę pojedynczą i zaimek go", () => {
    expect(warningFor(1)).toBe(
      "Uwaga: 1 plik różni się od v0.1.0 z tagu; potraktowano go jak zmieniony w projekcie",
    );
  });

  it.each([2, 4, 22])("%i pliki dostają formę pliki i zaimek je", (count) => {
    expect(warningFor(count)).toBe(
      `Uwaga: ${count} pliki różnią się od v0.1.0 z tagu; potraktowano je jak zmienione w projekcie`,
    );
  });

  it.each([5, 10, 11, 12, 13, 14, 21, 25, 112])(
    "%i plików dostaje formę plików",
    (count) => {
      expect(warningFor(count)).toBe(
        `Uwaga: ${count} plików różni się od v0.1.0 z tagu; potraktowano je jak zmienione w projekcie`,
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
      "Plan aktualizacji wa-kit 0.1.0 → 0.2.0 (bez zmian w projekcie)",
      "  bez zmian w plikach",
      "Uwaga: 2 pliki różnią się od v0.1.0 z tagu; potraktowano je jak zmienione w projekcie",
    ]);
  });
});
