import ts from "typescript";
import { listFiles, readRepoFile } from "./repo-files";

export const CLIENT_SAFE_AUTH_MODULES = [
  "@/shared/lib/auth/client",
  "@/shared/lib/auth/roles",
  "@/shared/lib/auth/permissions",
] as const;

const SERVER_MODULES = [
  "@/shared/lib/prisma",
  "@/shared/lib/env",
  "@/shared/lib/auth",
  "@/generated/prisma",
  "server-only",
];

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
  if (specifier.startsWith("node:")) {
    return true;
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

function importedSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = staticSpecifier(node);
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

export function findServerImportsInClient(source: string): string[] {
  const sourceFile = parse(source);
  if (!isUseClientDirective(sourceFile.statements[0])) {
    return [];
  }
  return importedSpecifiers(sourceFile).filter(isServerModule);
}

export function checkClientBundles(root: string): string[] {
  const files = listFiles(
    root,
    "src",
    (file) => SOURCE_FILE.test(file) && !file.startsWith(GENERATED_DIRECTORY),
  );
  return files.flatMap((file) =>
    findServerImportsInClient(readRepoFile(root, file)).map(
      (specifier) => `${file}: ${specifier}`,
    ),
  );
}
