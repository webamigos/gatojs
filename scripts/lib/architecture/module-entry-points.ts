import ts from "typescript";
import { globToRegExp } from "../../kit/manifest-deps";
import { existingFiles, listFiles, readRepoFile } from "./repo-files";

export const MODULE_GUARD_SOURCES: Readonly<Record<string, string>> = {
  requireModuleAccess: "@/shared/lib/auth/require-module-access",
  requireModuleEnabled: "@/shared/lib/modules/require-module-enabled",
  isModuleEnabled: "@/shared/lib/modules/require-module-enabled",
};

export const MODULE_GUARDS: readonly string[] =
  Object.keys(MODULE_GUARD_SOURCES);

const HTTP_METHODS: readonly string[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
];

const EXPORT_ALL = "*";
const IS_MODULE_ENABLED = "isModuleEnabled";
const PRISMA = "prisma";
const PRISMA_SOURCE = "@/shared/lib/prisma";
const ERROR_HANDLER = "handleCommandError";
const ERROR_HANDLER_SOURCE = "@/shared/utils/error-handling";
const KIT_FILE = ".wa/kit.json";
const CORE_MODULE = "core";
const APP_DIRECTORY = "src/app/";
const FEATURE_FILE = /^src\/features\/([^/]+)\//;
const ROUTE_FILE = /\/route\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
const TESTS_DIRECTORY = "/__tests__/";
const UNDISABLEABLE_FEATURES = [
  "src/features/auth/",
  "src/features/organizations/",
];

type OwnerOf = (file: string) => string | undefined;

type EventKind = "guard" | "prisma";

interface KitEntry {
  manifest?: { files?: string[] };
}

interface KitState {
  modules?: Record<string, KitEntry>;
  projectModules?: Record<string, KitEntry>;
}

interface ExportedName {
  name: string;
  body: ts.Node | undefined;
}

interface EntryPoint {
  id: string;
  guarded: boolean;
}

interface FileFacts {
  owner: string | undefined;
  guards: Map<string, string>;
  prisma: Set<string>;
  errorHandlers: Set<string>;
  constants: Map<string, string>;
  functions: Map<string, ts.Node>;
}

interface Scope {
  facts: FileFacts;
  body: ts.Node;
  returnExits: boolean;
  visiting: ReadonlySet<ts.Node>;
}

function parse(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
}

function moduleFilePatterns(root: string): [string, RegExp[]][] {
  if (existingFiles(root, [KIT_FILE]).length === 0) {
    return [];
  }
  const kit = JSON.parse(readRepoFile(root, KIT_FILE)) as KitState;
  return Object.entries({ ...kit.modules, ...kit.projectModules })
    .filter(([key]) => key !== CORE_MODULE)
    .map(([key, entry]) => [
      key,
      (entry.manifest?.files ?? []).map(globToRegExp),
    ]);
}

function ownerResolver(root: string): OwnerOf {
  const patterns = moduleFilePatterns(root);
  return (file) =>
    FEATURE_FILE.exec(file)?.[1] ??
    patterns.find(([, globs]) => globs.some((glob) => glob.test(file)))?.[0];
}

function hasModifier(
  statement: ts.FunctionDeclaration | ts.VariableStatement,
  kind: ts.SyntaxKind,
): boolean {
  return (statement.modifiers ?? []).some((modifier) => modifier.kind === kind);
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

function namedImports(
  statement: ts.Statement,
): { source: string; imported: string; local: string }[] {
  if (
    !ts.isImportDeclaration(statement) ||
    !ts.isStringLiteral(statement.moduleSpecifier)
  ) {
    return [];
  }
  const source = statement.moduleSpecifier.text;
  const bindings = statement.importClause?.namedBindings;
  if (bindings === undefined || !ts.isNamedImports(bindings)) {
    return [];
  }
  return bindings.elements.map((element) => ({
    source,
    imported: (element.propertyName ?? element.name).text,
    local: element.name.text,
  }));
}

function stringConstants(sourceFile: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isVariableStatement(statement) &&
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer !== undefined &&
          ts.isStringLiteral(declaration.initializer)
        ) {
          constants.set(declaration.name.text, declaration.initializer.text);
        }
      }
    }
  }
  return constants;
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

function fileFacts(
  sourceFile: ts.SourceFile,
  owner: string | undefined,
): FileFacts {
  const facts: FileFacts = {
    owner,
    guards: new Map(),
    prisma: new Set([PRISMA]),
    errorHandlers: new Set(),
    constants: stringConstants(sourceFile),
    functions: localFunctions(sourceFile),
  };
  for (const { source, imported, local } of sourceFile.statements.flatMap(
    namedImports,
  )) {
    if (MODULE_GUARD_SOURCES[imported] === source) {
      facts.guards.set(local, imported);
    }
    if (source === PRISMA_SOURCE) {
      facts.prisma.add(local);
    }
    if (source === ERROR_HANDLER_SOURCE && imported === ERROR_HANDLER) {
      facts.errorHandlers.add(local);
    }
  }
  return facts;
}

function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  return name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? boundNames(element.name) : [],
  );
}

function defaultExportBody(
  expression: ts.Expression,
  functions: Map<string, ts.Node>,
): ts.Node | undefined {
  if (ts.isIdentifier(expression)) {
    return functions.get(expression.text);
  }
  return isFunctionValue(expression) ? expression : undefined;
}

function exportDeclarationNames(
  statement: ts.ExportDeclaration,
  functions: Map<string, ts.Node>,
): ExportedName[] {
  const clause = statement.exportClause;
  if (clause === undefined) {
    return [{ name: EXPORT_ALL, body: undefined }];
  }
  if (ts.isNamespaceExport(clause)) {
    return [{ name: clause.name.text, body: undefined }];
  }
  return clause.elements.map((specifier) => ({
    name: specifier.name.text,
    body:
      statement.moduleSpecifier === undefined
        ? functions.get((specifier.propertyName ?? specifier.name).text)
        : undefined,
  }));
}

function exportedNames(
  statement: ts.Statement,
  functions: Map<string, ts.Node>,
): ExportedName[] {
  if (ts.isExportDeclaration(statement)) {
    return exportDeclarationNames(statement, functions);
  }
  if (ts.isExportAssignment(statement)) {
    return [
      {
        name: "default",
        body: defaultExportBody(statement.expression, functions),
      },
    ];
  }
  if (
    ts.isFunctionDeclaration(statement) &&
    hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
  ) {
    return [{ name: "default", body: statement }];
  }
  if (
    ts.isFunctionDeclaration(statement) &&
    statement.name !== undefined &&
    hasModifier(statement, ts.SyntaxKind.ExportKeyword)
  ) {
    return [{ name: statement.name.text, body: statement }];
  }
  if (
    ts.isVariableStatement(statement) &&
    hasModifier(statement, ts.SyntaxKind.ExportKeyword)
  ) {
    return statement.declarationList.declarations
      .flatMap((declaration) => boundNames(declaration.name))
      .map((name) => ({ name, body: functions.get(name) }));
  }
  return [];
}

function literalValue(
  argument: ts.Expression | undefined,
  constants: Map<string, string>,
): string | undefined {
  if (argument !== undefined && ts.isStringLiteral(argument)) {
    return argument.text;
  }
  if (argument !== undefined && ts.isIdentifier(argument)) {
    return constants.get(argument.text);
  }
  return undefined;
}

function namesOwner(call: ts.CallExpression, facts: FileFacts): boolean {
  const key = literalValue(call.arguments[0], facts.constants);
  return key !== undefined && key === facts.owner;
}

function exits(statement: ts.Statement, returnExits: boolean): boolean {
  const last = ts.isBlock(statement) ? statement.statements.at(-1) : statement;
  return (
    last !== undefined &&
    (ts.isThrowStatement(last) || (returnExits && ts.isReturnStatement(last)))
  );
}

function isEarlyExitCheck(call: ts.CallExpression, scope: Scope): boolean {
  const negation = call.parent;
  if (
    !ts.isPrefixUnaryExpression(negation) ||
    negation.operator !== ts.SyntaxKind.ExclamationToken
  ) {
    return false;
  }
  const condition = negation.parent;
  return (
    ts.isIfStatement(condition) &&
    exits(condition.thenStatement, scope.returnExits)
  );
}

function returnsThroughErrorHandler(
  statement: ts.Statement,
  facts: FileFacts,
): boolean {
  return (
    ts.isReturnStatement(statement) &&
    statement.expression !== undefined &&
    ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) &&
    facts.errorHandlers.has(statement.expression.expression.text)
  );
}

function swallows(clause: ts.CatchClause | undefined, facts: FileFacts) {
  const last = clause?.block.statements.at(-1);
  return (
    clause !== undefined &&
    (last === undefined ||
      (!ts.isThrowStatement(last) && !returnsThroughErrorHandler(last, facts)))
  );
}

function isSwallowed(node: ts.Node, scope: Scope): boolean {
  const parent = node.parent;
  if (parent === scope.body) {
    return false;
  }
  return (
    (ts.isTryStatement(parent) && swallows(parent.catchClause, scope.facts)) ||
    isSwallowed(parent, scope)
  );
}

function guardEvent(node: ts.Node, scope: Scope): EventKind | undefined {
  return isSwallowed(node, scope) ? undefined : "guard";
}

function callEvent(
  call: ts.CallExpression,
  callee: string,
  scope: Scope,
): EventKind | undefined {
  const guard = scope.facts.guards.get(callee);
  if (guard !== undefined) {
    const valid =
      namesOwner(call, scope.facts) &&
      (guard !== IS_MODULE_ENABLED || isEarlyExitCheck(call, scope));
    return valid ? guardEvent(call, scope) : undefined;
  }
  const helper = scope.facts.functions.get(callee);
  if (helper === undefined || scope.visiting.has(helper)) {
    return undefined;
  }
  const first = firstEvent({
    facts: scope.facts,
    body: helper,
    returnExits: false,
    visiting: new Set([...scope.visiting, helper]),
  });
  return first === "guard" ? guardEvent(call, scope) : first;
}

function eventAt(node: ts.Node, scope: Scope): EventKind | undefined {
  if (ts.isIdentifier(node) && scope.facts.prisma.has(node.text)) {
    return "prisma";
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    return callEvent(node, node.expression.text, scope);
  }
  return undefined;
}

function firstEvent(scope: Scope): EventKind | undefined {
  const visit = (node: ts.Node): EventKind | undefined => {
    if (ts.isFunctionLike(node)) {
      return undefined;
    }
    return eventAt(node, scope) ?? ts.forEachChild(node, visit);
  };
  return ts.forEachChild(scope.body, visit);
}

function isGuarded(facts: FileFacts, body: ts.Node | undefined): boolean {
  return (
    body !== undefined &&
    firstEvent({ facts, body, returnExits: true, visiting: new Set() }) ===
      "guard"
  );
}

function entryPointFilter(
  file: string,
  sourceFile: ts.SourceFile,
): (name: string) => boolean {
  if (file.startsWith(APP_DIRECTORY) && ROUTE_FILE.test(file)) {
    return (name) => name === EXPORT_ALL || HTTP_METHODS.includes(name);
  }
  const isServerActionFile = isUseServerDirective(sourceFile.statements[0]);
  return () => isServerActionFile;
}

function fileEntryPoints(
  root: string,
  file: string,
  ownerOf: OwnerOf,
): EntryPoint[] {
  const sourceFile = parse(file, readRepoFile(root, file));
  const facts = fileFacts(sourceFile, ownerOf(file));
  const isEntryPoint = entryPointFilter(file, sourceFile);
  return sourceFile.statements
    .flatMap((statement) => exportedNames(statement, facts.functions))
    .filter(({ name }) => isEntryPoint(name))
    .map(({ name, body }) => ({
      id: `${file}#${name}`,
      guarded: isGuarded(facts, body),
    }));
}

function isScannedSourceFile(file: string): boolean {
  return (
    SOURCE_FILE.test(file) &&
    !TEST_FILE.test(file) &&
    !file.includes(TESTS_DIRECTORY)
  );
}

function isDisableableFeatureFile(file: string): boolean {
  return (
    isScannedSourceFile(file) &&
    !UNDISABLEABLE_FEATURES.some((feature) => file.startsWith(feature))
  );
}

function candidateFiles(root: string, ownerOf: OwnerOf): string[] {
  return [
    ...listFiles(root, "src/app", isScannedSourceFile),
    ...listFiles(root, "src/features", isDisableableFeatureFile),
    ...listFiles(
      root,
      "src/shared",
      (file) => isScannedSourceFile(file) && ownerOf(file) !== undefined,
    ),
  ];
}

function allEntryPoints(root: string): EntryPoint[] {
  const ownerOf = ownerResolver(root);
  return candidateFiles(root, ownerOf).flatMap((file) =>
    fileEntryPoints(root, file, ownerOf),
  );
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
