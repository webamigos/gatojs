// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const readJson = (relative: string) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8")) as {
    seedFiles?: unknown;
    files?: unknown;
  };

describe.runIf(fs.existsSync(path.join(repoRoot, "kit/kit.json")))(
  "seed files in the kit",
  () => {
    it("kit/kit.json declares README.md, src/theme.css and the legal config and content as seed files", () => {
      expect(readJson("kit/kit.json").seedFiles).toEqual([
        "README.md",
        "src/theme.css",
        "src/features/legal/legal.config.ts",
        "src/features/legal/content/index.ts",
        "src/features/legal/content/terms.pl.tsx",
        "src/features/legal/content/terms.en.tsx",
        "src/features/legal/content/privacy.pl.tsx",
        "src/features/legal/content/privacy.en.tsx",
      ]);
    });

    it("kit/modules/legal.json owns the legal seed files through its glob", () => {
      expect(readJson("kit/modules/legal.json").files).toContain(
        "src/features/legal/**",
      );
    });

    it("every legal seed file exists in the kit", () => {
      for (const seed of [
        "src/features/legal/legal.config.ts",
        "src/features/legal/content/index.ts",
        "src/features/legal/content/terms.pl.tsx",
        "src/features/legal/content/terms.en.tsx",
        "src/features/legal/content/privacy.pl.tsx",
        "src/features/legal/content/privacy.en.tsx",
      ]) {
        expect(fs.existsSync(path.join(repoRoot, seed)), seed).toBe(true);
      }
    });

    it("kit/modules/core.json owns src/theme.css", () => {
      expect(readJson("kit/modules/core.json").files).toContain(
        "src/theme.css",
      );
    });
  },
);

const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

const IMPORT_SPECIFIER_PATTERNS = [
  /\b(?:import|export)\s+(?:type\s+)?[^'";]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function importSpecifiers(source: string): string[] {
  return IMPORT_SPECIFIER_PATTERNS.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] as string),
  );
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) {
    return path.posix.join("src", specifier.slice(2));
  }
  if (specifier.startsWith(".")) {
    return path.posix.join(path.posix.dirname(fromFile), specifier);
  }
  return null;
}

function featureDirsOfModules(): Map<string, string> {
  const dirs = new Map<string, string>();
  for (const name of fs.readdirSync(path.join(repoRoot, "kit/modules"))) {
    const files = readJson(`kit/modules/${name}`).files;
    for (const glob of Array.isArray(files) ? files : []) {
      const match = /^(src\/features\/[^/]+)\/\*\*$/.exec(String(glob));
      if (match?.[1]) {
        dirs.set(match[1], name);
      }
    }
  }
  return dirs;
}

function ownerDir(file: string, dirs: Map<string, string>): string | null {
  for (const dir of dirs.keys()) {
    if (file.startsWith(`${dir}/`)) {
      return dir;
    }
  }
  return null;
}

describe("import specifier extraction", () => {
  it("finds static, re-export, type-only, side-effect and dynamic imports", () => {
    expect(
      importSpecifiers(
        [
          'import { a } from "./a";',
          'import type { B } from "../b";',
          "import {\n  c,\n  d,\n} from '@/c';",
          'export { e } from "./e";',
          'export * from "./f";',
          'import "./g.css";',
          'const h = () => import("./h");',
          'import * as i from "node:fs";',
        ].join("\n"),
      ).sort(),
    ).toEqual(
      ["../b", "./a", "./e", "./f", "./g.css", "./h", "@/c", "node:fs"].sort(),
    );
  });

  it("resolves relative and @/ specifiers to project paths and ignores packages", () => {
    expect(
      resolveSpecifier("src/features/legal/content/index.ts", "./terms.pl"),
    ).toBe("src/features/legal/content/terms.pl");
    expect(
      resolveSpecifier(
        "src/features/legal/content/privacy.pl.tsx",
        "../components/cookie-settings-button",
      ),
    ).toBe("src/features/legal/components/cookie-settings-button");
    expect(
      resolveSpecifier(
        "src/features/legal/legal.config.ts",
        "@/features/legal/x",
      ),
    ).toBe("src/features/legal/x");
    expect(resolveSpecifier("src/features/legal/legal.config.ts", "zod")).toBe(
      null,
    );
  });
});

const hasKit = fs.existsSync(path.join(repoRoot, "kit/kit.json"));

describe.runIf(hasKit)(
  "seed files stand alone after the module is removed",
  () => {
    const seeds = hasKit
      ? (readJson("kit/kit.json").seedFiles as string[])
      : [];
    const dirs = hasKit ? featureDirsOfModules() : new Map<string, string>();
    const moduleSeeds = seeds.filter((seed) => ownerDir(seed, dirs) !== null);

    it("finds the legal seed files under src/features/legal", () => {
      expect(moduleSeeds).toEqual([
        "src/features/legal/legal.config.ts",
        "src/features/legal/content/index.ts",
        "src/features/legal/content/terms.pl.tsx",
        "src/features/legal/content/terms.en.tsx",
        "src/features/legal/content/privacy.pl.tsx",
        "src/features/legal/content/privacy.en.tsx",
      ]);
    });

    it("the content index still loads the four documents, so the check sees its imports", () => {
      const source = fs.readFileSync(
        path.join(repoRoot, "src/features/legal/content/index.ts"),
        "utf8",
      );

      expect(importSpecifiers(source)).toEqual(
        expect.arrayContaining([
          "./terms.pl",
          "./terms.en",
          "./privacy.pl",
          "./privacy.en",
        ]),
      );
    });

    it.each(moduleSeeds)(
      "%s imports nothing from its module except other seed files",
      (seed) => {
        const dir = ownerDir(seed, dirs) as string;
        const source = fs.readFileSync(path.join(repoRoot, seed), "utf8");
        const forbidden = importSpecifiers(source).filter((specifier) => {
          const target = resolveSpecifier(seed, specifier);
          if (target === null || !target.startsWith(`${dir}/`)) {
            return false;
          }
          return !SOURCE_EXTENSIONS.some((extension) =>
            seeds.includes(`${target}${extension}`),
          );
        });

        expect(forbidden).toEqual([]);
      },
    );
  },
);
