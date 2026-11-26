import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { listFiles, readRepoFile } from "./repo-files";

export const CLIENT_SAFE_AUTH_MODULES = [
  "@/shared/lib/auth/client",
  "@/shared/lib/auth/roles",
  "@/shared/lib/auth/permissions",
] as const;

const GATO_CONFIG_FILE = "src/gato.config.ts";

export const CLIENT_ENTRY_FILES = [
  GATO_CONFIG_FILE,
  "src/shared/lib/modules/gato-config.ts",
  "src/shared/lib/modules/component-overrides.ts",
] as const;

const SERVER_MODULES = [
  "@/shared/lib/events",
  "@/shared/lib/commands",
  "@/shared/lib/prisma",
  "@/env",
  "@gatojs/env",
  "@/shared/lib/auth",
  "@/generated/prisma",
  "server-only",
  "@/shared/components/slot",
  "@/modules.generated",
];

const MODULE_SERVER_FILE =
  /^@\/features\/[^/]+\/(events|subscribers|slots|command-hooks)$/;
const FEATURE_SERVICES = /^@\/features\/[^/]+\/services(\/|$)/;
const FEATURE_COMMANDS = /^@\/features\/[^/]+\/services\/commands(\/|$)/;
const RELATIVE_SPECIFIER = /^\.\.?\//;
const SOURCE_EXTENSION = /\.tsx?$/;
const SOURCE_ROOT = "src/";
const ALIAS_ROOT = "@/";
const LAZY_TARGET_SUFFIXES = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];
const FEATURE_LAZY_ENTRY_FILE =
  /^src\/features\/[^/]+\/(client-slots|components)\.ts$/;
const SOURCE_FILE = /\.tsx?$/;
const GENERATED_DIRECTORY = "src/generated/";

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("module.tsx", source, ts.ScriptTarget.Latest);
}

function isUseClientDirective(statement: ts.Statement | undefined): boolean {
  return (
    statement !== undefined &&
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression) &&
    statement.expression.text === "use client"
  );
}

export function isClientModule(source: string): boolean {
  return isUseClientDirective(parse(source).statements[0]);
}

function isServerModule(specifier: string): boolean {
  if (specifier.startsWith("node:") || MODULE_SERVER_FILE.test(specifier)) {
    return true;
  }
  if (FEATURE_SERVICES.test(specifier)) {
    return !FEATURE_COMMANDS.test(specifier);
  }
  if ((CLIENT_SAFE_AUTH_MODULES as readonly string[]).includes(specifier)) {
    return false;
  }
  return SERVER_MODULES.some(
    (module) => specifier === module || specifier.startsWith(`${module}/`),
  );
}

function staticSpecifier(statement: ts.Statement): string | undefined {
  if (ts.isImportDeclaration(statement)) {
    if (statement.importClause?.isTypeOnly) {
      return undefined;
    }
    return (statement.moduleSpecifier as ts.StringLiteral).text;
  }
  if (
    ts.isExportDeclaration(statement) &&
    !statement.isTypeOnly &&
    statement.moduleSpecifier !== undefined
  ) {
    return (statement.moduleSpecifier as ts.StringLiteral).text;
  }
  return undefined;
}

interface ImportedSpecifier {
  specifier: string;
  dynamic: boolean;
}

function importedSpecifiers(sourceFile: ts.SourceFile): ImportedSpecifier[] {
  const specifiers: ImportedSpecifier[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = staticSpecifier(node);
      if (specifier !== undefined) {
        specifiers.push({ specifier, dynamic: false });
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push({ specifier: node.arguments[0].text, dynamic: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function serverImports(sourceFile: ts.SourceFile): string[] {
  return importedSpecifiers(sourceFile)
    .map(({ specifier }) => specifier)
    .filter(isServerModule);
}

function resolvedRepoPath(file: string, specifier: string): string | null {
  if (specifier.startsWith(ALIAS_ROOT)) {
    return `${SOURCE_ROOT}${specifier.slice(ALIAS_ROOT.length)}`;
  }
  if (RELATIVE_SPECIFIER.test(specifier)) {
    return path.posix.join(path.posix.dirname(file), specifier);
  }
  return null;
}

function aliasOf(file: string, specifier: string): string {
  const resolved = RELATIVE_SPECIFIER.test(specifier)
    ? path.posix.join(path.posix.dirname(file), specifier)
    : null;
  if (resolved === null || !resolved.startsWith(SOURCE_ROOT)) {
    return specifier;
  }
  return `${ALIAS_ROOT}${resolved.slice(SOURCE_ROOT.length).replace(SOURCE_EXTENSION, "")}`;
}

function serverImportsOfFile(
  sourceFile: ts.SourceFile,
  file: string,
): string[] {
  return importedSpecifiers(sourceFile)
    .map(({ specifier }) => specifier)
    .filter((specifier) => isServerModule(aliasOf(file, specifier)));
}

function isRepoFile(root: string, file: string): boolean {
  const full = path.join(root, file);
  return fs.existsSync(full) && fs.statSync(full).isFile();
}

function lazyTargetOf(
  root: string,
  file: string,
  specifier: string,
): string | undefined {
  const base = resolvedRepoPath(file, specifier);
  if (base === null) {
    return undefined;
  }
  return LAZY_TARGET_SUFFIXES.map((suffix) => `${base}${suffix}`).find(
    (candidate) => isRepoFile(root, candidate),
  );
}

function lazyTargetsWithoutDirective(
  root: string,
  file: string,
  sourceFile: ts.SourceFile,
): string[] {
  return importedSpecifiers(sourceFile)
    .filter(({ dynamic }) => dynamic)
    .map(({ specifier }) => specifier)
    .filter((specifier) => {
      const target = lazyTargetOf(root, file, specifier);
      return (
        target !== undefined && !isClientModule(readRepoFile(root, target))
      );
    })
    .map((specifier) => `${specifier} (missing "use client")`);
}

export function findServerImportsInClient(source: string): string[] {
  const sourceFile = parse(source);
  if (!isUseClientDirective(sourceFile.statements[0])) {
    return [];
  }
  return serverImports(sourceFile);
}

function isClientEntryFile(file: string): boolean {
  return (
    (CLIENT_ENTRY_FILES as readonly string[]).includes(file) ||
    FEATURE_LAZY_ENTRY_FILE.test(file)
  );
}

function hasLazyClientTargets(file: string): boolean {
  return file === GATO_CONFIG_FILE || FEATURE_LAZY_ENTRY_FILE.test(file);
}

function serverImportsOf(root: string, file: string): string[] {
  const sourceFile = parse(readRepoFile(root, file));
  if (hasLazyClientTargets(file)) {
    return [
      ...serverImportsOfFile(sourceFile, file),
      ...lazyTargetsWithoutDirective(root, file, sourceFile),
    ];
  }
  if (
    isClientEntryFile(file) ||
    isUseClientDirective(sourceFile.statements[0])
  ) {
    return serverImportsOfFile(sourceFile, file);
  }
  return [];
}

export function checkClientBundles(root: string): string[] {
  const files = listFiles(
    root,
    "src",
    (file) => SOURCE_FILE.test(file) && !file.startsWith(GENERATED_DIRECTORY),
  );
  return files.flatMap((file) =>
    serverImportsOf(root, file).map((specifier) => `${file}: ${specifier}`),
  );
}
