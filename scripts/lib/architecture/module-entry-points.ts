import ts from "typescript";
import { listFiles, readRepoFile } from "./repo-files";

export const MODULE_GUARDS: readonly string[] = [
  "requireModuleAccess",
  "requireModuleEnabled",
  "isModuleEnabled",
  "runCommand",
];

const HTTP_METHODS: readonly string[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
];

const ROUTE_FILE = /\/route\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
const TESTS_DIRECTORY = "/__tests__/";
const UNDISABLEABLE_FEATURES = [
  "src/features/auth/",
  "src/features/organizations/",
];

interface ExportedName {
  name: string;
  local: string | undefined;
}

interface EntryPoint {
  id: string;
  guarded: boolean;
}

interface FileFacts {
  guards: Set<string>;
  functions: Map<string, ts.Node>;
}

function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
}

function isExported(
  statement: ts.FunctionDeclaration | ts.VariableStatement,
): boolean {
  return (statement.modifiers ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function isUseServerDirective(statement: ts.Statement | undefined): boolean {
  return (
    statement !== undefined &&
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression) &&
    statement.expression.text === "use server"
  );
}

function isFunctionValue(
  node: ts.Expression | undefined,
): node is ts.ArrowFunction | ts.FunctionExpression {
  return (
    node !== undefined &&
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
  );
}

function importedGuards(sourceFile: ts.SourceFile): Set<string> {
  const guards = new Set<string>();
  for (const statement of sourceFile.statements) {
    const bindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : undefined;
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (
          MODULE_GUARDS.includes((element.propertyName ?? element.name).text)
        ) {
          guards.add(element.name.text);
        }
      }
    }
  }
  return guards;
}

function localFunctions(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const functions = new Map<string, ts.Node>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      functions.set(statement.name.text, statement);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          isFunctionValue(declaration.initializer)
        ) {
          functions.set(declaration.name.text, declaration.initializer);
        }
      }
    }
  }
  return functions;
}

function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  return name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? boundNames(element.name) : [],
  );
}

function exportedNames(statement: ts.Statement): ExportedName[] {
  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause;
    if (clause === undefined || !ts.isNamedExports(clause)) {
      return [];
    }
    return clause.elements.map((specifier) => ({
      name: specifier.name.text,
      local:
        statement.moduleSpecifier === undefined
          ? (specifier.propertyName ?? specifier.name).text
          : undefined,
    }));
  }
  if (
    ts.isFunctionDeclaration(statement) &&
    statement.name !== undefined &&
    isExported(statement)
  ) {
    return [{ name: statement.name.text, local: statement.name.text }];
  }
  if (ts.isVariableStatement(statement) && isExported(statement)) {
    return statement.declarationList.declarations
      .flatMap((declaration) => boundNames(declaration.name))
      .map((name) => ({ name, local: name }));
  }
  return [];
}

function calledIdentifiers(node: ts.Node): string[] {
  const called: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
      called.push(child.expression.text);
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return called;
}

function reachesGuard(
  facts: FileFacts,
  local: string,
  visited: Set<string>,
): boolean {
  const body = facts.functions.get(local);
  if (body === undefined || visited.has(local)) {
    return false;
  }
  visited.add(local);
  return calledIdentifiers(body).some(
    (callee) =>
      facts.guards.has(callee) || reachesGuard(facts, callee, visited),
  );
}

function entryPointFilter(
  file: string,
  sourceFile: ts.SourceFile,
): (name: string) => boolean {
  if (file.startsWith("src/app/")) {
    return (name) => HTTP_METHODS.includes(name);
  }
  const isServerActionFile = isUseServerDirective(sourceFile.statements[0]);
  return () => isServerActionFile;
}

function fileEntryPoints(root: string, file: string): EntryPoint[] {
  const sourceFile = parse(file, readRepoFile(root, file));
  const facts: FileFacts = {
    guards: importedGuards(sourceFile),
    functions: localFunctions(sourceFile),
  };
  const isEntryPoint = entryPointFilter(file, sourceFile);
  return sourceFile.statements
    .flatMap(exportedNames)
    .filter(({ name }) => isEntryPoint(name))
    .map(({ name, local }) => ({
      id: `${file}#${name}`,
      guarded:
        local !== undefined && reachesGuard(facts, local, new Set<string>()),
    }));
}

function isFeatureSourceFile(file: string): boolean {
  return (
    SOURCE_FILE.test(file) &&
    !TEST_FILE.test(file) &&
    !file.includes(TESTS_DIRECTORY) &&
    !UNDISABLEABLE_FEATURES.some((feature) => file.startsWith(feature))
  );
}

function candidateFiles(root: string): string[] {
  return [
    ...listFiles(root, "src/app", (file) => ROUTE_FILE.test(file)),
    ...listFiles(root, "src/features", isFeatureSourceFile),
  ];
}

function allEntryPoints(root: string): EntryPoint[] {
  return candidateFiles(root).flatMap((file) => fileEntryPoints(root, file));
}

function sorted(values: string[]): string[] {
  return [...values].sort();
}

export function findModuleEntryPoints(root: string): string[] {
  return sorted(allEntryPoints(root).map(({ id }) => id));
}

export function findUnguardedModuleEntryPoints(
  root: string,
  allowed: ReadonlyMap<string, string>,
): string[] {
  return sorted(
    allEntryPoints(root)
      .filter(({ id, guarded }) => !guarded && !allowed.has(id))
      .map(({ id }) => id),
  );
}

export function findStaleAllowances(
  root: string,
  allowed: ReadonlyMap<string, string>,
): string[] {
  const entryPoints = new Set(findModuleEntryPoints(root));
  return sorted([...allowed.keys()].filter((key) => !entryPoints.has(key)));
}
