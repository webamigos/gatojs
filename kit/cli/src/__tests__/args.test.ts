import { describe, expect, it } from "vitest";
import {
  parseAddArgs,
  parseCreateArgs,
  parseListArgs,
  parseRemoveArgs,
} from "../args.js";

describe("parseCreateArgs", () => {
  it("brak katalogu zgłasza Podaj katalog projektu", () => {
    expect(() => parseCreateArgs([])).toThrow("Podaj katalog projektu");
  });

  it("sam cel dostaje wartości domyślne", () => {
    expect(parseCreateArgs(["acme"])).toEqual({
      target: "acme",
      modules: null,
      locales: null,
      title: null,
      adminEmail: null,
      yes: false,
      setup: false,
      install: true,
      git: true,
      kit: null,
    });
  });

  it("--modules bez wartości jest pustą listą, nie listą z pustym napisem", () => {
    expect(parseCreateArgs(["acme", "--modules", ""]).modules).toEqual([]);
  });

  it("--modules a,b daje dwa moduły", () => {
    expect(parseCreateArgs(["acme", "--modules", "a,b"]).modules).toEqual([
      "a",
      "b",
    ]);
  });

  it("brak --modules daje null", () => {
    expect(parseCreateArgs(["acme"]).modules).toBeNull();
  });

  it("--locales pl,en i --locales pl są poprawne", () => {
    expect(parseCreateArgs(["acme", "--locales", "pl,en"]).locales).toEqual([
      "pl",
      "en",
    ]);
    expect(parseCreateArgs(["acme", "--locales", "pl"]).locales).toEqual([
      "pl",
    ]);
  });

  it("--locales en odrzuca brak pl", () => {
    expect(() => parseCreateArgs(["acme", "--locales", "en"])).toThrow(
      "--locales: dozwolone pl,en; pl jest wymagany",
    );
  });

  it("--locales pl,de odrzuca nieznany język", () => {
    expect(() => parseCreateArgs(["acme", "--locales", "pl,de"])).toThrow(
      "--locales: dozwolone pl,en; pl jest wymagany",
    );
  });

  it("--no-install ustawia install false, --no-git ustawia git false", () => {
    const parsed = parseCreateArgs(["acme", "--no-install", "--no-git"]);
    expect(parsed.install).toBe(false);
    expect(parsed.git).toBe(false);
  });

  it("--setup z --no-install zgłasza błąd", () => {
    expect(() => parseCreateArgs(["acme", "--setup", "--no-install"])).toThrow(
      "--setup wymaga instalacji zależności (bez --no-install)",
    );
  });

  it("--setup bez --no-install ustawia setup true", () => {
    expect(parseCreateArgs(["acme", "--setup"]).setup).toBe(true);
  });

  it("czyta --title, --admin-email, --yes i --kit", () => {
    expect(
      parseCreateArgs([
        "acme",
        "--title",
        "Sklep Acme",
        "--admin-email",
        "a@x.pl",
        "--yes",
        "--kit",
        "/opt/wa-kit",
      ]),
    ).toMatchObject({
      target: "acme",
      title: "Sklep Acme",
      adminEmail: "a@x.pl",
      yes: true,
      kit: "/opt/wa-kit",
    });
  });

  it("flagi mogą stać przed celem", () => {
    expect(parseCreateArgs(["--yes", "acme"])).toMatchObject({
      target: "acme",
      yes: true,
    });
  });
});

describe("parseAddArgs", () => {
  it("sam moduł dostaje wartości domyślne", () => {
    expect(parseAddArgs(["demo"])).toEqual({
      module: "demo",
      kit: null,
      install: true,
    });
  });

  it("czyta --no-install i --kit", () => {
    expect(parseAddArgs(["demo", "--no-install", "--kit", "x"])).toEqual({
      module: "demo",
      kit: "x",
      install: false,
    });
  });

  it("brak modułu zgłasza Podaj nazwę modułu", () => {
    expect(() => parseAddArgs([])).toThrow("Podaj nazwę modułu");
  });
});

describe("parseRemoveArgs", () => {
  it("sama nazwa modułu dostaje wartości domyślne", () => {
    expect(parseRemoveArgs(["demo"])).toEqual({
      module: "demo",
      force: false,
      install: true,
    });
  });

  it("--force i --no-install zmieniają flagi", () => {
    expect(parseRemoveArgs(["demo", "--force", "--no-install"])).toEqual({
      module: "demo",
      force: true,
      install: false,
    });
  });

  it("brak nazwy modułu zgłasza Podaj nazwę modułu", () => {
    expect(() => parseRemoveArgs([])).toThrow("Podaj nazwę modułu");
  });
});

describe("parseListArgs", () => {
  it("bez argumentów kit jest null", () => {
    expect(parseListArgs([])).toEqual({ kit: null });
  });

  it("--kit x przekazuje źródło kitu", () => {
    expect(parseListArgs(["--kit", "x"])).toEqual({ kit: "x" });
  });

  it("argument pozycyjny jest odrzucany z komunikatem Nieoczekiwany argument", () => {
    expect(() => parseListArgs(["x"])).toThrow("Nieoczekiwany argument: x");
  });
});
