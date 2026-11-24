import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { listFiles, readRepoFile, unique } from "./repo-files";

const REMOTE_FONT_MODULE = "next/font/google";
const LOCAL_FONT_MODULE = "next/font/local";
const FONTS_DIRECTORY = "src/app/fonts";
const SOURCE_FILE = /\.tsx?$/;
const PACKAGE_SOURCE_FILE = /^packages\/[^/]+\/src\/.+\.tsx?$/;
const FONT_FILE =
  /^(.+?)-(?:latin-ext|latin|cyrillic-ext|cyrillic|greek-ext|greek|vietnamese)-.+\.woff2$/;

function parse(source: string, fileName = "module.tsx"): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
}

function isRemoteFontModule(specifier: string): boolean {
  return (
    specifier === REMOTE_FONT_MODULE ||
    specifier.startsWith(`${REMOTE_FONT_MODULE}/`)
  );
}

function declarationSpecifier(
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined {
  const specifier = node.moduleSpecifier;
  return specifier !== undefined && ts.isStringLiteral(specifier)
    ? specifier.text
    : undefined;
}

function callSpecifier(node: ts.CallExpression): string | undefined {
  const [argument] = node.arguments;
  const isImportOrRequire =
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === "require");
  return isImportOrRequire &&
    argument !== undefined &&
    ts.isStringLiteral(argument)
    ? argument.text
    : undefined;
}

function moduleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    let specifier: string | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = declarationSpecifier(node);
    } else if (ts.isCallExpression(node)) {
      specifier = callSpecifier(node);
    }
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function remoteFontImports(sourceFile: ts.SourceFile): string[] {
  return moduleSpecifiers(sourceFile).filter(isRemoteFontModule);
}

export function findRemoteFontImports(source: string): string[] {
  return remoteFontImports(parse(source));
}

interface RepoSource {
  file: string;
  sourceFile: ts.SourceFile;
}

function repoSources(root: string): RepoSource[] {
  return [
    ...listFiles(root, "src", (file) => SOURCE_FILE.test(file)),
    ...listFiles(root, "packages", (file) => PACKAGE_SOURCE_FILE.test(file)),
  ]
    .sort()
    .map((file) => ({
      file,
      sourceFile: parse(readRepoFile(root, file), path.posix.basename(file)),
    }));
}

function localFontLoaderNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      declarationSpecifier(statement) === LOCAL_FONT_MODULE &&
      statement.importClause?.name !== undefined
    ) {
      names.add(statement.importClause.name.text);
    }
  }
  return names;
}

function propertyValue(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of object.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name
    ) {
      return property.initializer;
    }
  }
  return undefined;
}

function stringValue(expression: ts.Expression | undefined): string[] {
  return expression !== undefined && ts.isStringLiteralLike(expression)
    ? [expression.text]
    : [];
}

function fontSourcePaths(source: ts.Expression | undefined): string[] {
  if (source === undefined || !ts.isArrayLiteralExpression(source)) {
    return stringValue(source);
  }
  return source.elements.flatMap((element) =>
    ts.isObjectLiteralExpression(element)
      ? stringValue(propertyValue(element, "path"))
      : [],
  );
}

function localFontSources(sourceFile: ts.SourceFile): string[] {
  const loaders = localFontLoaderNames(sourceFile);
  const sources: string[] = [];
  if (loaders.size === 0) {
    return sources;
  }
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      loaders.has(node.expression.text)
    ) {
      const [options] = node.arguments;
      if (options !== undefined && ts.isObjectLiteralExpression(options)) {
        sources.push(...fontSourcePaths(propertyValue(options, "src")));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sources;
}

function missingFontFiles(root: string, sources: RepoSource[]): string[] {
  return sources.flatMap(({ file, sourceFile }) => {
    const directory = path.dirname(path.join(root, file));
    return localFontSources(sourceFile)
      .filter((src) => !fs.existsSync(path.resolve(directory, src)))
      .map((src) => `${file}: ${src} does not exist`);
  });
}

export function findMissingLocalFontFiles(root: string): string[] {
  return missingFontFiles(root, repoSources(root));
}

function remoteFontFiles(sources: RepoSource[]): string[] {
  return sources
    .filter(({ sourceFile }) => remoteFontImports(sourceFile).length > 0)
    .map(({ file }) => `${file}: imports ${REMOTE_FONT_MODULE}`);
}

function fontFamily(fileName: string): string {
  return FONT_FILE.exec(fileName)?.[1] ?? fileName.replace(/\.woff2$/, "");
}

function findMissingLicenses(root: string): string[] {
  const fontFiles = listFiles(root, FONTS_DIRECTORY, (file) =>
    file.endsWith(".woff2"),
  );
  const families = unique(
    fontFiles.map((file) => fontFamily(path.posix.basename(file))),
  ).sort();
  return families
    .filter(
      (family) =>
        !fs.existsSync(
          path.join(root, FONTS_DIRECTORY, `LICENSE-${family}.txt`),
        ),
    )
    .map((family) => `${FONTS_DIRECTORY}: LICENSE-${family}.txt missing`);
}

export function checkFonts(root: string): string[] {
  const sources = repoSources(root);
  return [
    ...remoteFontFiles(sources),
    ...missingFontFiles(root, sources),
    ...findMissingLicenses(root),
  ];
}
