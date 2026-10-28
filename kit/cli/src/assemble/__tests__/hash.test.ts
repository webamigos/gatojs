import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { REGION_FILES } from "../../generate/targets.js";
import { fileHash, stripRegions } from "../hash.js";
import { testConfig } from "./manifests.js";

const lineArbitrary = fc
  .string({ maxLength: 20 })
  .filter((line) => !/[\r\n]/.test(line) && !line.includes("wa:"));
const linesArbitrary = fc.array(lineArbitrary, { maxLength: 5 });
const outsideArbitrary = fc.array(lineArbitrary, { maxLength: 4 });

const withRegion = (before: string[], inner: string[], after: string[]) =>
  [
    ...before,
    "# wa:modules:start",
    ...inner,
    "# wa:modules:end",
    ...after,
    "",
  ].join("\n");

describe("stripRegions", () => {
  it("linia z koncem regionu bez znacznika startu nie otwiera regionu", () => {
    expect(stripRegions("x\nmiddle\nwa:undefined:end\ny")).toBe(
      "x\nmiddle\nwa:undefined:end\ny",
    );
  });

  it("koniec regionu przed startem nie domyka go", () => {
    expect(stripRegions("# wa:m:end\n# wa:m:start\nA\n")).toBe(
      "# wa:m:end\n# wa:m:start\nA\n",
    );
  }, 2000);

  it("region zamyka najblizszy koniec, takze bezposrednio po starcie", () => {
    expect(stripRegions("# wa:m:start\n# wa:m:end\nX\n# wa:m:end\n")).toBe(
      "# wa:m:start\n# wa:m:end\nX\n# wa:m:end\n",
    );
  }, 2000);

  it("dwa regiony: oba puste, znaczniki i tresc poza nimi bez zmian", () => {
    const content = [
      "head",
      "# wa:modules:start",
      "A=1",
      "B=2",
      "# wa:modules:end",
      "middle",
      "# wa:services:start",
      "  db:",
      "# wa:services:end",
      "tail",
      "",
    ].join("\n");
    expect(stripRegions(content)).toBe(
      [
        "head",
        "# wa:modules:start",
        "# wa:modules:end",
        "middle",
        "# wa:services:start",
        "# wa:services:end",
        "tail",
        "",
      ].join("\n"),
    );
  });

  it("region z komentarzem slash zostawia znaczniki", () => {
    expect(
      stripRegions(
        "a\n// wa:relations:start\nposts Post[]\n// wa:relations:end\nb\n",
      ),
    ).toBe("a\n// wa:relations:start\n// wa:relations:end\nb\n");
  });

  it("niezamkniety region nie wycina niczego", () => {
    const content = "a\n# wa:modules:start\nA=1\nclient-edit\n";
    expect(stripRegions(content)).toBe(content);
  });

  it("end innego regionu nie zamyka otwartego", () => {
    const content = "# wa:a:start\nX\n# wa:b:end\nY\n";
    expect(stripRegions(content)).toBe(content);
  });

  it("pusty region zostaje bez zmian", () => {
    const content = "# wa:modules:start\n# wa:modules:end\n";
    expect(stripRegions(content)).toBe(content);
  });

  it("tresc bez regionow zostaje bez zmian", () => {
    expect(stripRegions("a\nb\n")).toBe("a\nb\n");
  });

  test.prop([outsideArbitrary, linesArbitrary, outsideArbitrary])(
    "jest idempotentne",
    (before, inner, after) => {
      const once = stripRegions(withRegion(before, inner, after));
      expect(stripRegions(once)).toBe(once);
    },
  );

  test.prop([
    outsideArbitrary,
    linesArbitrary,
    linesArbitrary,
    outsideArbitrary,
  ])("wynik nie zalezy od tresci regionu", (before, innerA, innerB, after) => {
    expect(stripRegions(withRegion(before, innerA, after))).toBe(
      stripRegions(withRegion(before, innerB, after)),
    );
  });

  test.prop([outsideArbitrary, linesArbitrary, outsideArbitrary])(
    "zachowuje znaczniki i linie poza regionem",
    (before, inner, after) => {
      expect(stripRegions(withRegion(before, inner, after))).toBe(
        withRegion(before, [], after),
      );
    },
  );
});

describe("fileHash", () => {
  it("to 64 znaki hex, wartosc sha256 dla znanej tresci", () => {
    expect(fileHash("src/a.ts", Buffer.from("abc"), testConfig)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("jest sha256 hex", () => {
    expect(fileHash("src/a.ts", Buffer.from("x"), testConfig)).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("nie zalezy od tresci regionow", () => {
    const a = "x\n# wa:modules:start\nA=1\n# wa:modules:end\n";
    const b = "x\n# wa:modules:start\n# wa:modules:end\n";
    expect(fileHash(".env.example", Buffer.from(a), testConfig)).toBe(
      fileHash(".env.example", Buffer.from(b), testConfig),
    );
  });

  it("zmienia sie przy zmianie tresci poza regionem", () => {
    const a = "x\n# wa:modules:start\n# wa:modules:end\n";
    const b = "y\n# wa:modules:start\n# wa:modules:end\n";
    expect(fileHash(".env.example", Buffer.from(a), testConfig)).not.toBe(
      fileHash(".env.example", Buffer.from(b), testConfig),
    );
  });

  it("package.json i package-lock.json maja hash managed", () => {
    expect(fileHash("package.json", Buffer.from("{}"), testConfig)).toBe(
      "managed",
    );
    expect(fileHash("package-lock.json", Buffer.from("{}"), testConfig)).toBe(
      "managed",
    );
  });

  it("zwykly plik nie dostaje managed", () => {
    expect(
      fileHash("src/package.json", Buffer.from("{}"), testConfig),
    ).not.toBe("managed");
  });

  test.prop([
    outsideArbitrary,
    linesArbitrary,
    linesArbitrary,
    outsideArbitrary,
  ])(
    "hash jest niezalezny od tresci regionu",
    (before, innerA, innerB, after) => {
      expect(
        fileHash(
          ".env.example",
          Buffer.from(withRegion(before, innerA, after)),
          testConfig,
        ),
      ).toBe(
        fileHash(
          ".env.example",
          Buffer.from(withRegion(before, innerB, after)),
          testConfig,
        ),
      );
    },
  );

  it("src/x.ts z markerami regionu hashuje surowe bajty", () => {
    const withA = Buffer.from("# wa:modules:start\nA\n# wa:modules:end\n");
    const withB = Buffer.from("# wa:modules:start\nB\n# wa:modules:end\n");
    expect(fileHash("src/x.ts", withA, testConfig)).toBe(
      "1a8c87f3752bbbd3be07ece581d6975d71664db66f9bce542b9acd6aa1c06ae6",
    );
    expect(fileHash("src/x.ts", withB, testConfig)).not.toBe(
      fileHash("src/x.ts", withA, testConfig),
    );
  });

  it("plik regionow z niezamknietym regionem reaguje na zmiane po starcie", () => {
    const a = Buffer.from("a\n# wa:modules:start\nA=1\nclient-edit\n");
    const b = Buffer.from("a\n# wa:modules:start\nA=1\nclient-edit2\n");
    expect(fileHash(".env.example", a, testConfig)).toBe(
      "1e5d5064adc43899314b6d75628595615591aa9017f71962e32567a1ab9659ea",
    );
    expect(fileHash(".env.example", b, testConfig)).toBe(
      "d55506a627919e487a8b65ba2abbad168470e034a7a8e9f377decc56855f866b",
    );
  });

  it("zamkniety region w pliku regionow hashuje wersje bez ciala", () => {
    const content = Buffer.from("a\n# wa:modules:start\nX\n# wa:modules:end\n");
    expect(fileHash(".env.example", content, testConfig)).toBe(
      "b6cb974d5bdb89771ea4ce7a5344f87f18e764d2b33cbcefc577aadf8b4aeb96",
    );
  });

  it("bufory rozniace sie bajtem niepoprawnym w UTF-8 maja rozne hashe", () => {
    expect(
      fileHash("src/a.bin", Buffer.from([0xff, 0x01]), testConfig),
    ).not.toBe(fileHash("src/a.bin", Buffer.from([0xfe, 0x01]), testConfig));
  });

  it("plik binarny hashuje surowe bajty", () => {
    expect(
      fileHash(
        "src/a.bin",
        Buffer.from([0xff, 0xfe, 0x00, 0x89, 0x50, 0x4e, 0x47]),
        testConfig,
      ),
    ).toBe("6a6e6599d88a9a8c7831b7de8a5451e9a2ccab385dafe8dfcf0a2db44894128c");
  });

  it("REGION_FILES to dokladnie cztery pliki z regionami generatora", () => {
    expect(REGION_FILES).toEqual([
      ".env.example",
      "docker-compose.yml",
      "prisma/schema/auth.prisma",
      "prisma/schema/organizations.prisma",
    ]);
  });
});
