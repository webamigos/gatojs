import { describe, expect, it } from "vitest";
import {
  parseAddArgs,
  parseCreateArgs,
  parseDoctorArgs,
  parseEjectArgs,
  parseListArgs,
  parseRemoveArgs,
  parseUpdateArgs,
} from "../args.js";

describe("parseCreateArgs", () => {
  it("brak katalogu zgłasza Specify the project directory", () => {
    expect(() => parseCreateArgs([])).toThrow("Specify the project directory");
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
      cliSource: null,
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
      "--locales: allowed values are pl,en; pl is required",
    );
  });

  it.each(["pl,pl", "pl,en,pl", "pl,en,en"])(
    "--locales %s odrzuca duplikaty",
    (value) => {
      expect(() => parseCreateArgs(["app", "--locales", value])).toThrow(
        "--locales: allowed values are pl,en; pl is required",
      );
    },
  );

  it("--locales pl,de odrzuca nieznany język", () => {
    expect(() => parseCreateArgs(["acme", "--locales", "pl,de"])).toThrow(
      "--locales: allowed values are pl,en; pl is required",
    );
  });

  it("--no-install ustawia install false, --no-git ustawia git false", () => {
    const parsed = parseCreateArgs(["acme", "--no-install", "--no-git"]);
    expect(parsed.install).toBe(false);
    expect(parsed.git).toBe(false);
  });

  it("--setup z --no-install zgłasza błąd", () => {
    expect(() => parseCreateArgs(["acme", "--setup", "--no-install"])).toThrow(
      "--setup needs dependencies installed (drop --no-install)",
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

describe("parseCreateArgs --cli-source", () => {
  it("without --cli-source cliSource is null", () => {
    expect(parseCreateArgs(["app"]).cliSource).toBeNull();
  });

  it("--cli-source <path> sets cliSource and keeps the target", () => {
    expect(
      parseCreateArgs(["app", "--cli-source", "/t/gato-cli-0.2.0.tgz"]),
    ).toEqual({
      target: "app",
      modules: null,
      locales: null,
      title: null,
      adminEmail: null,
      yes: false,
      setup: false,
      install: true,
      git: true,
      kit: null,
      cliSource: "/t/gato-cli-0.2.0.tgz",
    });
  });

  it("--cli-source=<path> sets cliSource", () => {
    expect(
      parseCreateArgs(["app", "--cli-source=pack/gato-cli-0.2.0.tgz"])
        .cliSource,
    ).toBe("pack/gato-cli-0.2.0.tgz");
  });

  it("--cli-source before the target does not take the target as its value", () => {
    expect(parseCreateArgs(["--cli-source", "/t/x.tgz", "app"])).toMatchObject({
      target: "app",
      cliSource: "/t/x.tgz",
    });
  });

  it("the --cli-source value alone is not a project directory", () => {
    expect(() => parseCreateArgs(["--cli-source", "/t/x.tgz"])).toThrow(
      "Specify the project directory",
    );
  });

  it("--cli-source does not change --kit", () => {
    expect(
      parseCreateArgs(["app", "--kit", "/k", "--cli-source", "/t/x.tgz"]),
    ).toMatchObject({ kit: "/k", cliSource: "/t/x.tgz" });
  });

  it.each([
    [["app", "--cli-source="]],
    [["app", "--cli-source"]],
    [["app", "--cli-source", ""]],
    [["app", "--cli-source", "--yes"]],
  ])("%j reports Option --cli-source needs a value", (argv) => {
    expect(messageOf(() => parseCreateArgs(argv))).toBe(
      "Option --cli-source needs a value",
    );
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

  it("brak modułu zgłasza Specify the module name", () => {
    expect(() => parseAddArgs([])).toThrow("Specify the module name");
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

  it("brak nazwy modułu zgłasza Specify the module name", () => {
    expect(() => parseRemoveArgs([])).toThrow("Specify the module name");
  });
});

describe("parseUpdateArgs", () => {
  it("sama wersja dostaje wartości domyślne", () => {
    expect(parseUpdateArgs(["0.2.0"])).toEqual({
      version: "0.2.0",
      kit: null,
      fromKit: null,
      dryRun: false,
      install: true,
    });
  });

  it("czyta --kit, --dry-run, --no-install i --from-kit", () => {
    expect(
      parseUpdateArgs([
        "0.2.0",
        "--kit",
        "/k",
        "--dry-run",
        "--no-install",
        "--from-kit",
        "/c",
      ]),
    ).toEqual({
      version: "0.2.0",
      kit: "/k",
      fromKit: "/c",
      dryRun: true,
      install: false,
    });
  });

  it("--no-install bez innych opcji ustawia tylko install false", () => {
    expect(parseUpdateArgs(["0.2.0", "--no-install"])).toEqual({
      version: "0.2.0",
      kit: null,
      fromKit: null,
      dryRun: false,
      install: false,
    });
  });

  it("--dry-run nie wyłącza instalacji", () => {
    expect(parseUpdateArgs(["0.2.0", "--dry-run"]).install).toBe(true);
  });

  it("opcje przed wersją są czytane tak samo", () => {
    expect(parseUpdateArgs(["--kit=/k", "1.10.3-rc.1"])).toEqual({
      version: "1.10.3-rc.1",
      kit: "/k",
      fromKit: null,
      dryRun: false,
      install: true,
    });
  });

  it("brak wersji zgłasza Specify the kit version", () => {
    expect(() => parseUpdateArgs([])).toThrow("Specify the kit version");
    expect(() => parseUpdateArgs(["--dry-run"])).toThrow(
      "Specify the kit version",
    );
  });

  it("nadmiarowy argument zgłasza Nieoczekiwany argument", () => {
    expect(messageOf(() => parseUpdateArgs(["0.2.0", "x"]))).toBe(
      "Unexpected argument: x",
    );
  });

  it.each([
    [["0.2.0", "--kit="], "Option --kit needs a value"],
    [["0.2.0", "--kit", ""], "Option --kit needs a value"],
    [["0.2.0", "--kit"], "Option --kit needs a value"],
    [["0.2.0", "--from-kit="], "Option --from-kit needs a value"],
    [["0.2.0", "--from-kit"], "Option --from-kit needs a value"],
  ])("%j zgłasza %s", (argv, message) => {
    expect(messageOf(() => parseUpdateArgs(argv))).toBe(message);
  });

  it("nieznana opcja zgłasza Nieznana opcja", () => {
    expect(messageOf(() => parseUpdateArgs(["0.2.0", "--force"]))).toBe(
      "Unknown option: --force",
    );
  });

  it("flaga z wartością jest odrzucana", () => {
    expect(messageOf(() => parseUpdateArgs(["0.2.0", "--dry-run=1"]))).toBe(
      "Option --dry-run takes no value",
    );
  });

  it.each(["v1", "v0.2.0", "0.2", "01.2.0"])(
    "nieprawidłowa wersja %s zgłasza błąd parseVersion",
    (value) => {
      expect(messageOf(() => parseUpdateArgs([value]))).toBe(
        `Invalid version: ${value}; use a version like 0.2.0`,
      );
    },
  );
});

describe("parseListArgs", () => {
  it("bez argumentów kit jest null", () => {
    expect(parseListArgs([])).toEqual({ kit: null });
  });

  it("--kit x przekazuje źródło kitu", () => {
    expect(parseListArgs(["--kit", "x"])).toEqual({ kit: "x" });
  });

  it("argument pozycyjny jest odrzucany z komunikatem Nieoczekiwany argument", () => {
    expect(() => parseListArgs(["x"])).toThrow("Unexpected argument: x");
  });
});

describe("nadmiarowe argumenty pozycyjne", () => {
  it("parseAddArgs zgłasza pierwszy nadmiarowy argument", () => {
    expect(() => parseAddArgs(["auth", "extra"])).toThrow(
      "Unexpected argument: extra",
    );
  });

  it("parseRemoveArgs zgłasza pierwszy nadmiarowy argument", () => {
    expect(() => parseRemoveArgs(["auth", "extra"])).toThrow(
      "Unexpected argument: extra",
    );
  });

  it("parseCreateArgs zgłasza nadmiarowy argument", () => {
    expect(() => parseCreateArgs(["acme", "extra"])).toThrow(
      "Unexpected argument: extra",
    );
  });

  it("parseCreateArgs przy dwóch nadmiarowych zgłasza pierwszy z nich", () => {
    expect(() => parseCreateArgs(["acme", "b", "c"])).toThrow(
      "Unexpected argument: b",
    );
  });

  it("parseAddArgs i parseRemoveArgs przy dwóch nadmiarowych zgłaszają pierwszy z nich", () => {
    expect(() => parseAddArgs(["auth", "b", "c"])).toThrow(
      "Unexpected argument: b",
    );
    expect(() => parseRemoveArgs(["auth", "b", "c"])).toThrow(
      "Unexpected argument: b",
    );
  });

  it("flaga przed celem nie zmienia liczenia nadmiarowych argumentów w create", () => {
    expect(() => parseCreateArgs(["--yes", "acme", "extra"])).toThrow(
      "Unexpected argument: extra",
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
      "Unknown option: --foo",
    );
    expect(messageOf(() => parseAddArgs(["auth", "--foo"]))).toBe(
      "Unknown option: --foo",
    );
  });

  it("nieznana krótka opcja", () => {
    expect(messageOf(() => parseAddArgs(["auth", "-x"]))).toBe(
      "Unknown option: -x",
    );
  });

  it("nieznana opcja w list, create i remove", () => {
    expect(messageOf(() => parseListArgs(["--foo"]))).toBe(
      "Unknown option: --foo",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--foo"]))).toBe(
      "Unknown option: --foo",
    );
    expect(messageOf(() => parseRemoveArgs(["auth", "--foo"]))).toBe(
      "Unknown option: --foo",
    );
  });

  it("opcja z wartością bez wartości", () => {
    expect(messageOf(() => parseAddArgs(["auth", "--kit"]))).toBe(
      "Option --kit needs a value",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--title"]))).toBe(
      "Option --title needs a value",
    );
  });

  it("opcja z wartością, po której stoi inna opcja", () => {
    expect(
      messageOf(() => parseAddArgs(["auth", "--kit", "--no-install"])),
    ).toBe("Option --kit needs a value");
  });

  it("flaga z wartością", () => {
    expect(messageOf(() => parseRemoveArgs(["auth", "--force=1"]))).toBe(
      "Option --force takes no value",
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
  ])("komunikat nie jest surowym tekstem parseArgs z Node", (run) => {
    const message = messageOf(run);
    expect(message).not.toContain("Unknown option '");
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
  ])("%s zgłasza Option --kit needs a value", (_nazwa, run) => {
    expect(messageOf(run)).toBe("Option --kit needs a value");
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
      "Unknown option: --foo",
    );
  });

  it("flaga z wartością nie przyjmuje wartości także tam, gdzie istnieje opcja string", () => {
    expect(messageOf(() => parseAddArgs(["auth", "--no-install=1"]))).toBe(
      "Option --no-install takes no value",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--no-git=1"]))).toBe(
      "Option --no-git takes no value",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--setup=1"]))).toBe(
      "Option --setup takes no value",
    );
  });

  it("flaga z wartością w remove, gdzie nie ma opcji string", () => {
    expect(messageOf(() => parseRemoveArgs(["auth", "--force=1"]))).toBe(
      "Option --force takes no value",
    );
    expect(messageOf(() => parseRemoveArgs(["auth", "--no-install=1"]))).toBe(
      "Option --no-install takes no value",
    );
  });

  it("opcja string bez wartości wymaga wartości w create i list", () => {
    expect(messageOf(() => parseCreateArgs(["acme", "--kit"]))).toBe(
      "Option --kit needs a value",
    );
    expect(messageOf(() => parseListArgs(["--kit"]))).toBe(
      "Option --kit needs a value",
    );
    expect(messageOf(() => parseCreateArgs(["acme", "--admin-email"]))).toBe(
      "Option --admin-email needs a value",
    );
  });

  it("opcja string zakończona flagą wymaga wartości", () => {
    expect(
      messageOf(() => parseAddArgs(["auth", "--kit", "--no-install"])),
    ).toBe("Option --kit needs a value");
  });
});

describe("parseDoctorArgs", () => {
  it("--files gives files true", () => {
    expect(parseDoctorArgs(["--files"])).toEqual({ files: true });
  });

  it("without --files reports that only --files is implemented", () => {
    expect(messageOf(() => parseDoctorArgs([]))).toBe(
      "Only --files is implemented; see the gato-cli spec §8",
    );
  });

  it("rejects an extra positional argument", () => {
    expect(messageOf(() => parseDoctorArgs(["--files", "x"]))).toBe(
      "Unexpected argument: x",
    );
  });

  it("rejects an unknown option", () => {
    expect(messageOf(() => parseDoctorArgs(["--files", "--foo"]))).toBe(
      "Unknown option: --foo",
    );
  });

  it("rejects a value given to --files", () => {
    expect(messageOf(() => parseDoctorArgs(["--files=1"]))).toBe(
      "Option --files takes no value",
    );
  });
});

describe("parseEjectArgs", () => {
  it("file with --reason gives the file, the reason, undo false and no kit", () => {
    expect(parseEjectArgs(["src/a.ts", "--reason", "custom login"])).toEqual({
      file: "src/a.ts",
      reason: "custom login",
      undo: false,
      kit: null,
    });
  });

  it("--reason before the file is accepted", () => {
    expect(parseEjectArgs(["--reason", "custom login", "src/a.ts"])).toEqual({
      file: "src/a.ts",
      reason: "custom login",
      undo: false,
      kit: null,
    });
  });

  it("--undo with a file gives undo true and no reason", () => {
    expect(parseEjectArgs(["--undo", "src/a.ts"])).toEqual({
      file: "src/a.ts",
      reason: null,
      undo: true,
      kit: null,
    });
  });

  it("--undo with --kit passes the kit source", () => {
    expect(parseEjectArgs(["--undo", "src/a.ts", "--kit", "/k"])).toEqual({
      file: "src/a.ts",
      reason: null,
      undo: true,
      kit: "/k",
    });
  });

  it.each([
    [[], "Specify the file to eject"],
    [["--reason", "x"], "Specify the file to eject"],
    [["--undo"], "Specify the file to eject"],
    [["src/a.ts"], 'Specify why the file is ejected: --reason "<why>"'],
    [
      ["src/a.ts", "--reason", "   "],
      'Specify why the file is ejected: --reason "<why>"',
    ],
    [
      ["src/a.ts", "--reason="],
      'Specify why the file is ejected: --reason "<why>"',
    ],
    [["--undo", "src/a.ts", "--reason", "x"], "--undo takes no --reason"],
    [
      ["src/a.ts", "--reason", "x", "--kit", "/k"],
      "--kit is only used with --undo",
    ],
    [["src/a.ts", "b", "--reason", "x"], "Unexpected argument: b"],
    [["--undo", "src/a.ts", "b"], "Unexpected argument: b"],
    [["src/a.ts", "--reason", "x", "--force"], "Unknown option: --force"],
    [["--undo=1", "src/a.ts"], "Option --undo takes no value"],
  ])("%j reports %s", (argv, message) => {
    expect(messageOf(() => parseEjectArgs(argv))).toBe(message);
  });
});
