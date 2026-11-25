// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const globalsPath = path.join(repoRoot, "src/app/globals.css");
const themePath = path.join(repoRoot, "src/theme.css");

const withoutComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("project theme layer", () => {
  let workDir: string;

  beforeEach(() => {
    const cacheDir = path.join(repoRoot, "node_modules/.cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    workDir = fs.mkdtempSync(path.join(cacheDir, "theme-css-"));
    fs.mkdirSync(path.join(workDir, "app"));
    fs.copyFileSync(globalsPath, path.join(workDir, "app/globals.css"));
    fs.writeFileSync(
      path.join(workDir, "theme.css"),
      ":root { --primary: #ff0000; }\n",
    );
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it("a token set in theme.css comes after every Gato --primary token in the compiled CSS", async () => {
    const from = path.join(workDir, "app/globals.css");
    const result = await postcss([
      tailwindcss({ base: workDir, optimize: false }),
    ]).process(fs.readFileSync(from, "utf8"), { from });

    const projectToken = result.css.indexOf("--primary: #ff0000");
    const gatoLightToken = result.css.indexOf("--primary: #2563eb");
    const gatoDarkToken = result.css.indexOf("--primary: #3b76f6");

    expect(gatoLightToken).toBeGreaterThan(-1);
    expect(gatoDarkToken).toBeGreaterThan(-1);
    expect(projectToken).toBeGreaterThan(gatoLightToken);
    expect(projectToken).toBeGreaterThan(gatoDarkToken);
  }, 60_000);

  it("globals.css ends with the import of ../theme.css", () => {
    expect(fs.readFileSync(globalsPath, "utf8").trimEnd()).toMatch(
      /@import "\.\.\/theme\.css";$/,
    );
  });

  it("src/theme.css exists", () => {
    expect(fs.existsSync(themePath)).toBe(true);
  });
});

describe.runIf(fs.existsSync(path.join(repoRoot, "kit/kit.json")))(
  "src/theme.css in the kit",
  () => {
    const readTheme = () =>
      fs.existsSync(themePath) ? fs.readFileSync(themePath, "utf8") : "";

    it("declares nothing outside comments", () => {
      const theme = readTheme();
      expect(theme).not.toBe("");
      expect(withoutComments(theme).trim()).toBe("");
    });

    it("shows :root { --primary } and @theme inline { --font-sans } in a comment", () => {
      const theme = readTheme();
      expect(theme).toContain(":root");
      expect(theme).toContain("--primary");
      expect(theme).toContain("@theme inline");
      expect(theme).toContain("--font-sans");
    });
  },
);
