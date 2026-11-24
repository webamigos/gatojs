// @vitest-environment node
import { fc, test } from "@fast-check/vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkFonts,
  findMissingLocalFontFiles,
  findRemoteFontImports,
} from "../../../scripts/lib/architecture/fonts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("findRemoteFontImports", () => {
  it("finds a static named import", () => {
    expect(
      findRemoteFontImports('import { Inter } from "next/font/google";'),
    ).toEqual(["next/font/google"]);
  });

  it("finds a default and a namespace import", () => {
    expect(
      findRemoteFontImports(
        'import google from "next/font/google";\nimport * as fonts from "next/font/google";',
      ),
    ).toEqual(["next/font/google", "next/font/google"]);
  });

  it("finds a side-effect import", () => {
    expect(findRemoteFontImports('import "next/font/google";')).toEqual([
      "next/font/google",
    ]);
  });

  it("finds a named re-export", () => {
    expect(
      findRemoteFontImports('export { Inter } from "next/font/google";'),
    ).toEqual(["next/font/google"]);
  });

  it("finds a star re-export", () => {
    expect(findRemoteFontImports('export * from "next/font/google";')).toEqual([
      "next/font/google",
    ]);
  });

  it("finds an awaited dynamic import", () => {
    expect(findRemoteFontImports('await import("next/font/google")')).toEqual([
      "next/font/google",
    ]);
  });

  it("finds a dynamic import inside a function body", () => {
    expect(
      findRemoteFontImports(
        'export async function load() {\n  const mod = await import("next/font/google");\n  return mod.Inter;\n}',
      ),
    ).toEqual(["next/font/google"]);
  });

  it("finds a dynamic import that is not awaited", () => {
    expect(
      findRemoteFontImports('const pending = import("next/font/google");'),
    ).toEqual(["next/font/google"]);
  });

  it("finds a require call", () => {
    expect(
      findRemoteFontImports('const google = require("next/font/google");'),
    ).toEqual(["next/font/google"]);
  });

  it("returns a subpath specifier as written", () => {
    expect(
      findRemoteFontImports('import "next/font/google/target.css";'),
    ).toEqual(["next/font/google/target.css"]);
  });

  it("does not report a package that only shares the prefix", () => {
    expect(
      findRemoteFontImports('import x from "next/font/google-extra";'),
    ).toEqual([]);
  });

  it("does not report next/font/local", () => {
    expect(findRemoteFontImports('import x from "next/font/local";')).toEqual(
      [],
    );
  });

  it("does not report other modules imported dynamically or required", () => {
    expect(
      findRemoteFontImports(
        'await import("next/font/local");\nrequire("next/font/local");\nexport * from "./google";',
      ),
    ).toEqual([]);
  });

  it("does not count the specifier inside a string literal", () => {
    expect(
      findRemoteFontImports(
        "const s = 'import { Inter } from \"next/font/google\"';",
      ),
    ).toEqual([]);
  });

  it("does not count the specifier inside a template literal", () => {
    expect(
      findRemoteFontImports('const s = `await import("next/font/google")`;'),
    ).toEqual([]);
  });

  it("does not count the specifier inside comments", () => {
    expect(
      findRemoteFontImports(
        '// import { Inter } from "next/font/google";\n/* require("next/font/google") */\nexport const a = 1;',
      ),
    ).toEqual([]);
  });

  it("reports every occurrence once, in source order, among other imports", () => {
    expect(
      findRemoteFontImports(
        [
          'import localFont from "next/font/local";',
          'import { Inter } from "next/font/google";',
          'export { Roboto } from "next/font/google/target.css";',
          'const g = require("next/font/google");',
        ].join("\n"),
      ),
    ).toEqual([
      "next/font/google",
      "next/font/google/target.css",
      "next/font/google",
    ]);
  });

  it("parses TSX source", () => {
    expect(
      findRemoteFontImports(
        'import { Inter } from "next/font/google";\nexport const Page = () => <div className="x">{"next/font/google"}</div>;',
      ),
    ).toEqual(["next/font/google"]);
  });

  test.prop([fc.string()])(
    "text inside a string literal is never reported",
    (text) => {
      const source = `const s = ${JSON.stringify(`import { Inter } from "next/font/google"; ${text}`)};`;

      expect(findRemoteFontImports(source)).toEqual([]);
    },
  );

  test.prop([fc.array(fc.boolean(), { maxLength: 8 })])(
    "reports one entry per google import and none per local import",
    (isGoogle) => {
      const source = isGoogle
        .map((google, index) =>
          google
            ? `import f${index} from "next/font/google";`
            : `import f${index} from "next/font/local";`,
        )
        .join("\n");

      expect(findRemoteFontImports(source)).toHaveLength(
        isGoogle.filter(Boolean).length,
      );
    },
  );
});

describe("findMissingLocalFontFiles and checkFonts", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const localFontFile = (src: string) =>
    `import localFont from "next/font/local";\nexport const f = localFont({ src: ${src}, display: "swap" });\n`;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "fonts-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns nothing for an empty repository", () => {
    expect(findMissingLocalFontFiles(root)).toEqual([]);
    expect(checkFonts(root)).toEqual([]);
  });

  it("checkFonts reports a src that does not exist", () => {
    write(
      "src/app/fonts/fonts.ts",
      'import localFont from "next/font/local"; export const f = localFont({ src: "./missing.woff2" });',
    );

    expect(checkFonts(root)).toEqual([
      "src/app/fonts/fonts.ts: ./missing.woff2 does not exist",
    ]);
  });

  it("accepts a string src that exists next to the calling file", () => {
    write("src/app/fonts/inter.woff2", "woff2");
    write("src/app/fonts/fonts.ts", localFontFile('"./inter.woff2"'));

    expect(findMissingLocalFontFiles(root)).toEqual([]);
  });

  it("resolves src against the calling file, not the repository root", () => {
    write("inter.woff2", "woff2");
    write("src/app/fonts/fonts.ts", localFontFile('"./inter.woff2"'));

    expect(findMissingLocalFontFiles(root)).toEqual([
      "src/app/fonts/fonts.ts: ./inter.woff2 does not exist",
    ]);
  });

  it("resolves a src that walks into a sibling directory", () => {
    write("src/app/fonts/inter.woff2", "woff2");
    write("src/app/layout.tsx", localFontFile('"./fonts/inter.woff2"'));
    write("src/lib/font.ts", localFontFile('"../app/fonts/inter.woff2"'));

    expect(findMissingLocalFontFiles(root)).toEqual([]);
  });

  it("checks every path of the array src form, in source order", () => {
    write("src/app/fonts/present.woff2", "woff2");
    write(
      "src/app/fonts/fonts.ts",
      localFontFile(
        '[{ path: "./zeta.woff2", weight: "400" }, { path: "./present.woff2", weight: "500" }, { path: "./alpha.woff2", weight: "700" }]',
      ),
    );

    expect(findMissingLocalFontFiles(root)).toEqual([
      "src/app/fonts/fonts.ts: ./zeta.woff2 does not exist",
      "src/app/fonts/fonts.ts: ./alpha.woff2 does not exist",
    ]);
  });

  it("accepts an array src whose paths all exist", () => {
    write("src/app/fonts/a.woff2", "woff2");
    write("src/app/fonts/b.woff2", "woff2");
    write(
      "src/app/fonts/fonts.ts",
      localFontFile('[{ path: "./a.woff2" }, { path: "./b.woff2" }]'),
    );

    expect(findMissingLocalFontFiles(root)).toEqual([]);
  });

  it("follows the local name of the default import", () => {
    write(
      "src/app/fonts/fonts.ts",
      'import myFont from "next/font/local";\nexport const f = myFont({ src: "./gone.woff2" });\n',
    );

    expect(findMissingLocalFontFiles(root)).toEqual([
      "src/app/fonts/fonts.ts: ./gone.woff2 does not exist",
    ]);
  });

  it("ignores a function of the same name imported from another module", () => {
    write(
      "src/app/fonts/fonts.ts",
      'import localFont from "./my-loader";\nexport const f = localFont({ src: "./gone.woff2" });\n',
    );

    expect(findMissingLocalFontFiles(root)).toEqual([]);
  });

  it("checks every call in a file, in source order", () => {
    write(
      "src/app/fonts/fonts.ts",
      'import localFont from "next/font/local";\nexport const a = localFont({ src: "./b.woff2" });\nexport const b = localFont({ src: "./a.woff2" });\n',
    );

    expect(findMissingLocalFontFiles(root)).toEqual([
      "src/app/fonts/fonts.ts: ./b.woff2 does not exist",
      "src/app/fonts/fonts.ts: ./a.woff2 does not exist",
    ]);
  });

  it("scans the src tree of every package", () => {
    write("packages/ui/src/fonts.ts", localFontFile('"./gone.woff2"'));

    expect(findMissingLocalFontFiles(root)).toEqual([
      "packages/ui/src/fonts.ts: ./gone.woff2 does not exist",
    ]);
  });

  it("does not scan outside src, packages/*/src and TypeScript files", () => {
    write("scripts/fonts.ts", localFontFile('"./gone.woff2"'));
    write("packages/ui/lib/fonts.ts", localFontFile('"./gone.woff2"'));
    write("src/app/fonts.js", localFontFile('"./gone.woff2"'));
    write("src/app/fonts.md", localFontFile('"./gone.woff2"'));
    write("src/node_modules/pkg/index.ts", localFontFile('"./gone.woff2"'));
    write("src/app/google.md", 'import { Inter } from "next/font/google";\n');
    write(
      "src/node_modules/pkg/google.ts",
      'import { Inter } from "next/font/google";\n',
    );

    expect(findMissingLocalFontFiles(root)).toEqual([]);
    expect(checkFonts(root)).toEqual([]);
  });

  it("orders missing files by repository path code point", () => {
    write("src/a/fonts.ts", localFontFile('"./x.woff2"'));
    write("src/a-b/fonts.tsx", localFontFile('"./y.woff2"'));
    write("packages/ui/src/fonts.ts", localFontFile('"./z.woff2"'));

    expect(findMissingLocalFontFiles(root)).toEqual([
      "packages/ui/src/fonts.ts: ./z.woff2 does not exist",
      "src/a-b/fonts.tsx: ./y.woff2 does not exist",
      "src/a/fonts.ts: ./x.woff2 does not exist",
    ]);
  });

  it("reports each file with a remote import once, sorted by code point", () => {
    write(
      "src/a/layout.tsx",
      'import { Inter } from "next/font/google";\nimport { Roboto } from "next/font/google";\n',
    );
    write("src/a-b/font.ts", 'const g = await import("next/font/google");\n');
    write(
      "packages/ui/src/font.ts",
      'export { Inter } from "next/font/google";\n',
    );
    write("src/clean.ts", 'import localFont from "next/font/local";\n');

    expect(checkFonts(root)).toEqual([
      "packages/ui/src/font.ts: imports next/font/google",
      "src/a-b/font.ts: imports next/font/google",
      "src/a/layout.tsx: imports next/font/google",
    ]);
  });

  it("reports a remote import reached only through require", () => {
    write("src/font.ts", 'const g = require("next/font/google");\n');

    expect(checkFonts(root)).toEqual(["src/font.ts: imports next/font/google"]);
  });

  it("reports a missing license for a font family", () => {
    write("src/app/fonts/inter-latin-wght-normal.woff2", "woff2");
    write("src/app/fonts/inter-latin-ext-wght-normal.woff2", "woff2");

    expect(checkFonts(root)).toEqual([
      "src/app/fonts: LICENSE-inter.txt missing",
    ]);
  });

  it("accepts a family with its license", () => {
    write("src/app/fonts/inter-latin-wght-normal.woff2", "woff2");
    write("src/app/fonts/inter-latin-ext-wght-normal.woff2", "woff2");
    write("src/app/fonts/LICENSE-inter.txt", "SIL OFL 1.1");

    expect(checkFonts(root)).toEqual([]);
  });

  it("does not accept another family's license", () => {
    write("src/app/fonts/inter-latin-wght-normal.woff2", "woff2");
    write("src/app/fonts/LICENSE-roboto.txt", "Apache 2.0");

    expect(checkFonts(root)).toEqual([
      "src/app/fonts: LICENSE-inter.txt missing",
    ]);
  });

  it("does not ask for a license when only non-woff2 files exist", () => {
    write("src/app/fonts/inter-latin-wght-normal.woff", "woff");
    write("src/app/fonts/inter-latin-wght-normal.ttf", "ttf");

    expect(checkFonts(root)).toEqual([]);
  });

  it.each([
    ["cyrillic", "roboto-cyrillic-400-normal.woff2"],
    ["cyrillic-ext", "roboto-cyrillic-ext-400-normal.woff2"],
    ["greek", "roboto-greek-400-normal.woff2"],
    ["greek-ext", "roboto-greek-ext-400-normal.woff2"],
    ["vietnamese", "roboto-vietnamese-400-normal.woff2"],
    ["latin-ext", "roboto-latin-ext-400-normal.woff2"],
  ])("derives the family from a %s subset file", (_subset, file) => {
    write(`src/app/fonts/${file}`, "woff2");

    expect(checkFonts(root)).toEqual([
      "src/app/fonts: LICENSE-roboto.txt missing",
    ]);
  });

  it("keeps a hyphenated family name whole", () => {
    write("src/app/fonts/barlow-condensed-latin-500-normal.woff2", "woff2");
    write("src/app/fonts/LICENSE-barlow.txt", "SIL OFL 1.1");

    expect(checkFonts(root)).toEqual([
      "src/app/fonts: LICENSE-barlow-condensed.txt missing",
    ]);
  });

  it("lists missing licenses by family name code point", () => {
    write("src/app/fonts/barlow-condensed-latin-500-normal.woff2", "woff2");
    write("src/app/fonts/barlow-latin-400-normal.woff2", "woff2");
    write("src/app/fonts/zilla-latin-400-normal.woff2", "woff2");
    write("src/app/fonts/alegreya-greek-400-normal.woff2", "woff2");

    expect(checkFonts(root)).toEqual([
      "src/app/fonts: LICENSE-alegreya.txt missing",
      "src/app/fonts: LICENSE-barlow.txt missing",
      "src/app/fonts: LICENSE-barlow-condensed.txt missing",
      "src/app/fonts: LICENSE-zilla.txt missing",
    ]);
  });

  it("lists remote imports, then missing src files, then missing licenses", () => {
    write("src/app/fonts/inter-latin-wght-normal.woff2", "woff2");
    write("src/app/fonts/fonts.ts", localFontFile('"./missing.woff2"'));
    write("src/app/layout.tsx", 'import { Inter } from "next/font/google";\n');

    expect(checkFonts(root)).toEqual([
      "src/app/layout.tsx: imports next/font/google",
      "src/app/fonts/fonts.ts: ./missing.woff2 does not exist",
      "src/app/fonts: LICENSE-inter.txt missing",
    ]);
  });
});

describe("repo", () => {
  it("fonts are bundled, present and licensed", () => {
    expect(checkFonts(repoRoot)).toEqual([]);
  });
});
