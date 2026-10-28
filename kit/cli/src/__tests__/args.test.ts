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

  it.each(["pl,pl", "pl,en,pl", "pl,en,en"])(
    "--locales %s odrzuca duplikaty",
    (value) => {
      expect(() => parseCreateArgs(["app", "--locales", value])).toThrow(
        "--locales: dozwolone pl,en; pl jest wymagany",
      );
    },
  );

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

describe("nadmiarowe argumenty pozycyjne", () => {
  it("parseAddArgs zgłasza pierwszy nadmiarowy argument", () => {
    expect(() => parseAddArgs(["auth", "extra"])).toThrow(
      "Nieoczekiwany argument: extra",
    );
  });

  it("parseRemoveArgs zgłasza pierwszy nadmiarowy argument", () => {
    expect(() => parseRemoveArgs(["auth", "extra"])).toThrow(
      "Nieoczekiwany argument: extra",
    );
  });

  it("parseCreateArgs zgłasza nadmiarowy argument", () => {
    expect(() => parseCreateArgs(["acme", "extra"])).toThrow(
      "Nieoczekiwany argument: extra",
    );
  });

  it("parseCreateArgs przy dwóch nadmiarowych zgłasza pierwszy z nich", () => {
    expect(() => parseCreateArgs(["acme", "b", "c"])).toThrow(
      "Nieoczekiwany argument: b",
    );
  });

  it("parseAddArgs i parseRemoveArgs przy dwóch nadmiarowych zgłaszają pierwszy z nich", () => {
    expect(() => parseAddArgs(["auth", "b", "c"])).toThrow(
      "Nieoczekiwany argument: b",
    );
    expect(() => parseRemoveArgs(["auth", "b", "c"])).toThrow(
      "Nieoczekiwany argument: b",
    );
  });

  it("flaga przed celem nie zmienia liczenia nadmiarowych argumentów w create", () => {
    expect(() => parseCreateArgs(["--yes", "acme", "extra"])).toThrow(
      "Nieoczekiwany argument: extra",
    );
  });
});

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Oczekiwano błędu");
}

describe("błędy opcji po polsku", () => {
  it("nieznana długa opcja", () => {
    expect(() => parseAddArgs(["auth", "--foo"])).toThrow(
      "Nieznana opcja: --foo",
    );
    expect(messageOf(() => parseAddArgs(["auth", "--foo"]))).toBe(
      "Nieznana opcja: --foo",
    );
  });

  it("nieznana krótka opcja", () => {
    expect(messageOf(() => parseAddArgs(["auth", "-x"]))).toBe(
      "Nieznana opcja: -x",
    );
  });

  it("nieznana opcja w list, create i remove", () => {
    expect(messageOf(() => parseListArgs(["--foo"]))).toBe(
      "Nieznana opcja: --foo",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--foo"]))).toBe(
      "Nieznana opcja: --foo",
    );
    expect(messageOf(() => parseRemoveArgs(["auth", "--foo"]))).toBe(
      "Nieznana opcja: --foo",
    );
  });

  it("opcja z wartością bez wartości", () => {
    expect(messageOf(() => parseAddArgs(["auth", "--kit"]))).toBe(
      "Opcja --kit wymaga wartości",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--title"]))).toBe(
      "Opcja --title wymaga wartości",
    );
  });

  it("opcja z wartością, po której stoi inna opcja", () => {
    expect(
      messageOf(() => parseAddArgs(["auth", "--kit", "--no-install"])),
    ).toBe("Opcja --kit wymaga wartości");
  });

  it("flaga z wartością", () => {
    expect(messageOf(() => parseRemoveArgs(["auth", "--force=1"]))).toBe(
      "Opcja --force nie przyjmuje wartości",
    );
  });

  it.each([
    () => parseAddArgs(["auth", "--foo"]),
    () => parseAddArgs(["auth", "-x"]),
    () => parseAddArgs(["auth", "--kit"]),
    () => parseAddArgs(["auth", "--kit", "--no-install"]),
    () => parseRemoveArgs(["auth", "--force=1"]),
    () => parseListArgs(["--foo"]),
    () => parseCreateArgs(["acme", "--title"]),
  ])("komunikat nie zawiera angielskiego tekstu Node", (run) => {
    const message = messageOf(run);
    expect(message).not.toContain("Unknown option");
    expect(message).not.toContain("argument missing");
    expect(message).not.toContain("ambiguous");
    expect(message).not.toContain("does not take");
    expect(message).not.toContain("Option '");
  });
});

describe("pusta wartość --kit", () => {
  it.each([
    ["add --kit=", () => parseAddArgs(["demo", "--kit="])],
    [
      "add --kit z pustym argumentem",
      () => parseAddArgs(["demo", "--kit", ""]),
    ],
    ["list --kit=", () => parseListArgs(["--kit="])],
    ["list --kit z pustym argumentem", () => parseListArgs(["--kit", ""])],
    ["create --kit=", () => parseCreateArgs(["acme", "--kit="])],
    [
      "create --kit z pustym argumentem",
      () => parseCreateArgs(["acme", "--kit", ""]),
    ],
  ])("%s zgłasza Opcja --kit wymaga wartości", (_nazwa, run) => {
    expect(messageOf(run)).toBe("Opcja --kit wymaga wartości");
  });

  it("niepusty --kit jest przekazywany w add, list i create", () => {
    expect(parseAddArgs(["demo", "--kit", "x"]).kit).toBe("x");
    expect(parseListArgs(["--kit=x"]).kit).toBe("x");
    expect(parseCreateArgs(["acme", "--kit", "x"]).kit).toBe("x");
  });

  it("brak --kit daje null w add, list i create", () => {
    expect(parseAddArgs(["demo"]).kit).toBeNull();
    expect(parseListArgs([]).kit).toBeNull();
    expect(parseCreateArgs(["acme"]).kit).toBeNull();
  });

  it("pusty --title i --admin-email pozostają dozwolone", () => {
    expect(parseCreateArgs(["acme", "--title", ""]).title).toBe("");
    expect(parseCreateArgs(["acme", "--admin-email", ""]).adminEmail).toBe("");
  });

  it("pusty --modules nadal oznacza brak modułów", () => {
    expect(parseCreateArgs(["acme", "--modules", ""]).modules).toEqual([]);
  });
});

describe("rozróżnianie opcji z wartością i flag w komunikatach", () => {
  it("nieznana opcja z wartością po znaku równości podaje samą nazwę", () => {
    expect(messageOf(() => parseAddArgs(["auth", "--foo=bar"]))).toBe(
      "Nieznana opcja: --foo",
    );
  });

  it("flaga z wartością nie przyjmuje wartości także tam, gdzie istnieje opcja string", () => {
    expect(messageOf(() => parseAddArgs(["auth", "--no-install=1"]))).toBe(
      "Opcja --no-install nie przyjmuje wartości",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--no-git=1"]))).toBe(
      "Opcja --no-git nie przyjmuje wartości",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--setup=1"]))).toBe(
      "Opcja --setup nie przyjmuje wartości",
    );
  });

  it("flaga z wartością w remove, gdzie nie ma opcji string", () => {
    expect(messageOf(() => parseRemoveArgs(["auth", "--force=1"]))).toBe(
      "Opcja --force nie przyjmuje wartości",
    );
    expect(messageOf(() => parseRemoveArgs(["auth", "--no-install=1"]))).toBe(
      "Opcja --no-install nie przyjmuje wartości",
    );
  });

  it("opcja string bez wartości wymaga wartości w create i list", () => {
    expect(messageOf(() => parseCreateArgs(["acme", "--kit"]))).toBe(
      "Opcja --kit wymaga wartości",
    );
    expect(messageOf(() => parseListArgs(["--kit"]))).toBe(
      "Opcja --kit wymaga wartości",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--admin-email"]))).toBe(
      "Opcja --admin-email wymaga wartości",
    );
  });

  it("opcja string zakończona flagą wymaga wartości", () => {
    expect(
      messageOf(() => parseAddArgs(["auth", "--kit", "--no-install"])),
    ).toBe("Opcja --kit wymaga wartości");
  });
});
