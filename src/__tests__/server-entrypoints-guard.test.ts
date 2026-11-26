// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

const SESSION_GUARDS = new Set([
  "getOrgContext",
  "requireModuleAccess",
  "getAdminUserOrNull",
  "requireUser",
  "getCurrentUser",
  "getImpersonatedByUserId",
  "getSession",
]);

const UNGUARDED_ALLOWED = new Map([
  [
    "src/features/organizations/services/queries/default-organization-query.ts#getDefaultActiveOrganizationId",
    "called by the session.create.before hook with the userId of the session being created",
  ],
]);

type FunctionLike =
  ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

interface LocalFunction {
  node: FunctionLike;
  exported: boolean;
}

interface SourceScope {
  functions: Map<string, LocalFunction>;
  importedNames: Map<string, string>;
  prismaBindings: Set<string>;
}

const PRISMA_MODULE = "@/shared/lib/prisma";

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

function collectFunctions(file: ts.SourceFile): Map<string, LocalFunction> {
  const functions = new Map<string, LocalFunction>();
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, {
        node: statement,
        exported: isExported(statement),
      });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (
          ts.isIdentifier(declaration.name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          functions.set(declaration.name.text, {
            node: init,
            exported: isExported(statement),
          });
        }
      }
    }
  }
  for (const statement of file.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const specifier of statement.exportClause.elements) {
        const localName = (specifier.propertyName ?? specifier.name).text;
        const local = functions.get(localName);
        if (local) {
          local.exported = true;
        }
      }
    }
  }
  return functions;
}

function importedLocalNames(declaration: ts.ImportDeclaration): string[] {
  const clause = declaration.importClause;
  if (!clause) {
    return [];
  }
  const bindings = clause.namedBindings;
  const named =
    bindings && ts.isNamedImports(bindings)
      ? bindings.elements.map((specifier) => specifier.name.text)
      : [];
  const namespace =
    bindings && ts.isNamespaceImport(bindings) ? [bindings.name.text] : [];
  const defaultName = clause.name ? [clause.name.text] : [];
  return [...defaultName, ...namespace, ...named];
}

function isModuleImport(
  declaration: ts.ImportDeclaration,
  moduleName: string,
): boolean {
  return (
    ts.isStringLiteral(declaration.moduleSpecifier) &&
    declaration.moduleSpecifier.text === moduleName
  );
}

function scopeOf(file: ts.SourceFile): SourceScope {
  const scope: SourceScope = {
    functions: collectFunctions(file),
    importedNames: new Map(),
    prismaBindings: new Set(["prisma"]),
  };
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          scope.importedNames.set(
            specifier.name.text,
            (specifier.propertyName ?? specifier.name).text,
          );
        }
      }
      if (isModuleImport(statement, PRISMA_MODULE)) {
        for (const localName of importedLocalNames(statement)) {
          scope.prismaBindings.add(localName);
        }
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (
          ts.isIdentifier(declaration.name) &&
          init &&
          ts.isIdentifier(init)
        ) {
          scope.importedNames.set(
            declaration.name.text,
            originalName(init.text, scope),
          );
          if (scope.prismaBindings.has(init.text)) {
            scope.prismaBindings.add(declaration.name.text);
          }
        }
      }
    }
  }
  return scope;
}

function originalName(name: string, scope: SourceScope): string {
  return scope.importedNames.get(name) ?? name;
}

function isPrismaReference(node: ts.Node, scope: SourceScope): boolean {
  return (
    ts.isIdentifier(node) &&
    (scope.prismaBindings.has(node.text) ||
      originalName(node.text, scope) === "prisma")
  );
}

function calleeName(
  call: ts.CallExpression,
  scope: SourceScope,
): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return originalName(callee.text, scope);
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return null;
}

function localCalleeName(call: ts.CallExpression): string | null {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
}

const COMMAND_RUNNER = "runCommand";

function isReturnedDirectly(
  call: ts.CallExpression,
  fn: FunctionLike,
): boolean {
  const value = ts.isAwaitExpression(call.parent) ? call.parent : call;
  const holder = value.parent;
  return (
    (ts.isReturnStatement(holder) &&
      holder.expression === value &&
      holder.parent === fn.body) ||
    fn.body === value
  );
}

function isCommandRun(call: ts.CallExpression, scope: SourceScope): boolean {
  const localName = localCalleeName(call);
  return (
    localName !== null && originalName(localName, scope) === COMMAND_RUNNER
  );
}

function isReturnedCommandRun(
  call: ts.CallExpression,
  fn: FunctionLike,
  scope: SourceScope,
): boolean {
  return isCommandRun(call, scope) && isReturnedDirectly(call, fn);
}

interface Access {
  kind: "guard" | "prisma";
  position: number;
}

function accessesOf(
  node: FunctionLike,
  scope: SourceScope,
  visiting: Set<string> = new Set(),
): Access[] {
  const found: Access[] = [];
  const visit = (child: ts.Node) => {
    if (isPrismaReference(child, scope)) {
      found.push({ kind: "prisma", position: child.getStart() });
    }
    if (ts.isCallExpression(child)) {
      const name = calleeName(child, scope);
      if (name && SESSION_GUARDS.has(name)) {
        found.push({ kind: "guard", position: child.getStart() });
      }
      if (isReturnedCommandRun(child, node, scope)) {
        found.push({ kind: "guard", position: child.getEnd() });
      }
      const localName = localCalleeName(child);
      const local = localName ? scope.functions.get(localName) : undefined;
      if (localName && local && !visiting.has(localName)) {
        const inner = accessesOf(
          local.node,
          scope,
          new Set([...visiting, localName]),
        );
        const first = inner.sort((a, b) => a.position - b.position)[0];
        if (first) {
          found.push({ kind: first.kind, position: child.getStart() });
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found.sort((a, b) => a.position - b.position);
}

function hasUseServerDirective(file: ts.SourceFile): boolean {
  const [first] = file.statements;
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

function findUnguardedEntrypoints(
  path: string,
  source: string,
  isEntrypointFile: (file: ts.SourceFile) => boolean,
): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  if (!isEntrypointFile(file)) {
    return [];
  }
  const scope = scopeOf(file);
  const violations: string[] = [];
  for (const [name, fn] of scope.functions) {
    if (!fn.exported || UNGUARDED_ALLOWED.has(`${path}#${name}`)) {
      continue;
    }
    const [first] = accessesOf(fn.node, scope);
    if (first?.kind !== "guard") {
      violations.push(`${path}#${name}`);
    }
  }
  return violations;
}

type ServiceModeEvent = "orgContext" | "confirmation" | "prisma";

const SERVICE_MODE_CONFIRMATION = "assertServiceModeConfirmed";

const ORG_CONTEXT_SOURCES = new Set(["getOrgContext", "requireModuleAccess"]);

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind >= ts.SyntaxKind.FirstAssignment &&
    kind <= ts.SyntaxKind.LastAssignment
  );
}

function reassignedNames(fn: FunctionLike): Set<string> {
  const names = new Set<string>();
  const visit = (child: ts.Node) => {
    if (
      ts.isBinaryExpression(child) &&
      isAssignmentOperator(child.operatorToken.kind) &&
      ts.isIdentifier(child.left)
    ) {
      names.add(child.left.text);
    }
    ts.forEachChild(child, visit);
  };
  if (fn.body) {
    visit(fn.body);
  }
  return names;
}

function parameterNames(fn: FunctionLike): string[] {
  const reassigned = reassignedNames(fn);
  return fn.parameters.map((parameter) =>
    ts.isIdentifier(parameter.name) &&
    !parameter.initializer &&
    !reassigned.has(parameter.name.text)
      ? parameter.name.text
      : "",
  );
}

function isTrustedConfirmation(
  argument: ts.Expression | undefined,
  trusted: Set<string>,
): boolean {
  return (
    argument !== undefined &&
    ts.isIdentifier(argument) &&
    trusted.has(argument.text)
  );
}

function serviceModeEventsOf(
  fn: FunctionLike,
  scope: SourceScope,
  trusted: Set<string>,
  visiting: Set<string> = new Set(),
): ServiceModeEvent[] {
  const events: ServiceModeEvent[] = [];
  const visit = (child: ts.Node) => {
    if (isPrismaReference(child, scope)) {
      events.push("prisma");
    }
    ts.forEachChild(child, visit);
    if (!ts.isCallExpression(child)) {
      return;
    }
    const name = calleeName(child, scope);
    if (name && ORG_CONTEXT_SOURCES.has(name)) {
      events.push("orgContext");
    }
    if (
      name === SERVICE_MODE_CONFIRMATION &&
      isTrustedConfirmation(child.arguments[1], trusted)
    ) {
      events.push("confirmation");
    }
    if (isCommandRun(child, scope)) {
      events.push("orgContext");
    }
    if (
      isReturnedCommandRun(child, fn, scope) &&
      isTrustedConfirmation(child.arguments[2], trusted)
    ) {
      events.push("confirmation");
    }
    const localName = localCalleeName(child);
    const local = localName ? scope.functions.get(localName) : undefined;
    if (localName && local && !visiting.has(localName)) {
      const helperTrusted = new Set(
        parameterNames(local.node).filter(
          (parameter, index) =>
            parameter !== "" &&
            isTrustedConfirmation(child.arguments[index], trusted),
        ),
      );
      events.push(
        ...serviceModeEventsOf(
          local.node,
          scope,
          helperTrusted,
          new Set([...visiting, localName]),
        ),
      );
    }
  };
  ts.forEachChild(fn, visit);
  return events;
}

function confirmsServiceModeBeforePrisma(events: ServiceModeEvent[]): boolean {
  const confirmation = events.indexOf("confirmation");
  if (confirmation === -1) {
    return false;
  }
  const prisma = events.indexOf("prisma");
  return prisma === -1 || confirmation < prisma;
}

function findUnconfirmedServiceModeEntrypoints(
  path: string,
  source: string,
  isEntrypointFile: (file: ts.SourceFile) => boolean,
): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  if (!isEntrypointFile(file)) {
    return [];
  }
  const scope = scopeOf(file);
  const violations: string[] = [];
  for (const [name, fn] of scope.functions) {
    if (!fn.exported) {
      continue;
    }
    const events = serviceModeEventsOf(
      fn.node,
      scope,
      new Set(parameterNames(fn.node).filter((parameter) => parameter !== "")),
    );
    if (
      events.includes("orgContext") &&
      !confirmsServiceModeBeforePrisma(events)
    ) {
      violations.push(`${path}#${name}`);
    }
  }
  return violations;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return ["__tests__", "generated"].includes(entry.name)
        ? []
        : listSourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const isServerEntrypoint = (file: ts.SourceFile) =>
  hasUseServerDirective(file) || /\/services\/queries\//.test(file.fileName);

const anyFile = () => true;

describe("findUnguardedEntrypoints", () => {
  it("akcja bez guardu sesji → naruszenie", () => {
    const source = `export async function deleteAll() { await prisma.user.deleteMany(); }`;
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#deleteAll",
    ]);
  });

  it("Prisma przed guardem → naruszenie", () => {
    const source = [
      "export async function list() {",
      "  const rows = await prisma.user.findMany();",
      "  await getOrgContext();",
      "  return rows;",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("eksportowana funkcja strzałkowa bez guardu → naruszenie", () => {
    const source = `export const list = async () => prisma.user.findMany();`;
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("Prisma ukryta w lokalnym helperze przed guardem → naruszenie", () => {
    const source = [
      "async function load() { return prisma.user.findMany(); }",
      "export async function list() { const rows = await load(); await getOrgContext(); return rows; }",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("bez wywołania czegokolwiek → naruszenie", () => {
    expect(
      findUnguardedEntrypoints(
        "a.ts",
        "export async function noop() { return 1; }",
        anyFile,
      ),
    ).toEqual(["a.ts#noop"]);
  });

  it("guard przez lokalny helper przed Prismą → zgodne", () => {
    const source = [
      "async function context() { return getOrgContext(); }",
      "export async function list() {",
      "  const { organizationId } = await context();",
      "  return prisma.item.findMany({ where: { organizationId } });",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([]);
  });

  it("guard auth.api.getSession przed operacją → zgodne", () => {
    const source = `export async function change() { const s = await auth.api.getSession({}); await prisma.user.update({}); }`;
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([]);
  });

  it("nieeksportowane helpery nie są punktami wejścia", () => {
    const source = `async function helper() { await prisma.user.findMany(); }`;
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([]);
  });
});

describe("findUnconfirmedServiceModeEntrypoints", () => {
  it("getOrgContext i Prisma bez potwierdzenia → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const { organizationId } = await getOrgContext();",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("getOrgContext bez potwierdzenia i bez Prismy → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  return service.create(context, input);",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("potwierdzenie po dostępie do Prismy → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  const row = await prisma.item.create({ data: { organizationId: context.organizationId } });",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return row;",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("Prisma przed getOrgContext i potwierdzeniem → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const existing = await prisma.user.findUnique({ where: { email: input.email } });",
      "  const context = await getOrgContext();",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return prisma.item.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("getOrgContext, potwierdzenie, potem Prisma → zgodne", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return prisma.item.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual([]);
  });

  it("getOrgContext i potwierdzenie w lokalnym helperze przed Prismą → zgodne", () => {
    const source = [
      "async function confirmedContext(confirmation) {",
      "  const context = await getOrgContext();",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return context;",
      "}",
      "export async function create(input, confirmation) {",
      "  const { organizationId } = await confirmedContext(confirmation);",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual([]);
  });

  it("lokalny helper woła getOrgContext bez potwierdzenia → naruszenie", () => {
    const source = [
      "async function context() { return getOrgContext(); }",
      "export async function create(input, confirmation) {",
      "  const { organizationId } = await context();",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("potwierdzenie w helperze wołanym po Prismie → naruszenie", () => {
    const source = [
      "function confirm(context, confirmation) { assertServiceModeConfirmed(context, confirmation); }",
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  const row = await prisma.item.create({ data: { organizationId: context.organizationId } });",
      "  confirm(context, confirmation);",
      "  return row;",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("Prisma ukryta w helperze przed potwierdzeniem → naruszenie", () => {
    const source = [
      "async function load(organizationId) { return prisma.item.findMany({ where: { organizationId } }); }",
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  const rows = await load(context.organizationId);",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return rows;",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("eksportowana funkcja strzałkowa z getOrgContext bez potwierdzenia → naruszenie", () => {
    const source = [
      "export const create = async (input, confirmation) => {",
      "  const { organizationId } = await getOrgContext();",
      "  return prisma.item.create({ data: { organizationId } });",
      "};",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("akcja bez getOrgContext nie podlega regule", () => {
    const source = [
      "export async function changePassword(input) {",
      "  const admin = await getAdminUserOrNull();",
      "  return prisma.user.update({ where: { id: admin.id }, data: input });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual([]);
  });

  it("nieeksportowany helper nie jest punktem wejścia", () => {
    const source = [
      "async function helper() {",
      "  const { organizationId } = await getOrgContext();",
      "  return prisma.item.findMany({ where: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual([]);
  });

  it("plik poza punktami wejścia jest pomijany", () => {
    const source = [
      "export async function create() {",
      "  const { organizationId } = await getOrgContext();",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints(
        "a.ts",
        source,
        hasUseServerDirective,
      ),
    ).toEqual([]);
    expect(
      findUnconfirmedServiceModeEntrypoints(
        "a.ts",
        `"use server";\n${source}`,
        hasUseServerDirective,
      ),
    ).toEqual(["a.ts#create"]);
  });
});

describe("findUnguardedEntrypoints: aliasy i re-eksporty", () => {
  it("Prisma pod aliasem importu przed guardem → naruszenie", () => {
    const source = [
      'import { prisma as db } from "@/shared/lib/prisma";',
      "export async function list() {",
      "  const rows = await db.user.findMany();",
      "  await getOrgContext();",
      "  return rows;",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("guard pod aliasem importu przed Prismą → zgodne", () => {
    const source = [
      'import { getOrgContext as ctx } from "@/shared/lib/auth/org-context";',
      "export async function list() {",
      "  const { organizationId } = await ctx();",
      "  return prisma.item.findMany({ where: { organizationId } });",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([]);
  });

  it("dowolna funkcja zaimportowana pod nazwą guardu nie jest guardem → naruszenie", () => {
    const source = [
      'import { noop as getOrgContext } from "./noop";',
      "export async function list() {",
      "  await getOrgContext();",
      "  return prisma.item.findMany();",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("funkcja wyeksportowana przez export { } bez guardu → naruszenie", () => {
    const source = [
      "async function list() { return prisma.item.findMany(); }",
      "export { list };",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("funkcja wyeksportowana przez export { x as y } bez guardu → naruszenie", () => {
    const source = [
      "const list = async () => prisma.item.findMany();",
      "export { list as listItems };",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });
});

describe("findUnconfirmedServiceModeEntrypoints: obejścia", () => {
  it("Prisma pod aliasem importu zapisuje przed potwierdzeniem → naruszenie", () => {
    const source = [
      'import { prisma as db } from "@/shared/lib/prisma";',
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  const row = await db.item.create({ data: { organizationId: context.organizationId } });",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return row;",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("getOrgContext pod aliasem importu bez potwierdzenia → naruszenie", () => {
    const source = [
      'import { getOrgContext as ctx } from "@/shared/lib/auth/org-context";',
      "export async function create(input, confirmation) {",
      "  const { organizationId } = await ctx();",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("funkcja wyeksportowana przez export { } bez potwierdzenia → naruszenie", () => {
    const source = [
      "async function create(input, confirmation) {",
      "  const { organizationId } = await getOrgContext();",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
      "export { create };",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("potwierdzenie podrobione literałem → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  assertServiceModeConfirmed(context, { serviceModeConfirmed: true, organizationId: context.organizationId });",
      "  return prisma.item.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("potwierdzenie z lokalnej zmiennej zamiast parametru → naruszenie", () => {
    const source = [
      "export async function create(input) {",
      "  const context = await getOrgContext();",
      "  const confirmation = { serviceModeConfirmed: true, organizationId: context.organizationId };",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return prisma.item.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("helper dostaje podrobione potwierdzenie zamiast parametru → naruszenie", () => {
    const source = [
      "async function confirmedContext(confirmation) {",
      "  const context = await getOrgContext();",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return context;",
      "}",
      "export async function create(input, confirmation) {",
      "  const { organizationId } = await confirmedContext({ serviceModeConfirmed: true });",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("Prisma w argumencie potwierdzenia wykonuje się przed nim → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  assertServiceModeConfirmed(context, confirmation, await prisma.item.create({ data: {} }));",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });
});

describe("findUnguardedEntrypoints: Prisma pod inną nazwą", () => {
  it("dowolny import z modułu Prismy nazwany lokalnie prisma przed guardem → naruszenie", () => {
    const source = [
      'import { client as prisma } from "@/shared/lib/prisma";',
      "export async function list() {",
      "  const rows = await prisma.item.findMany();",
      "  await getOrgContext();",
      "  return rows;",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("dowolny import z modułu Prismy pod dowolną nazwą przed guardem → naruszenie", () => {
    const source = [
      'import { client as store } from "@/shared/lib/prisma";',
      "export async function list() {",
      "  const rows = await store.item.findMany();",
      "  await getOrgContext();",
      "  return rows;",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("import przestrzeni nazw modułu Prismy przed guardem → naruszenie", () => {
    const source = [
      'import * as database from "@/shared/lib/prisma";',
      "export async function list() {",
      "  const rows = await database.client.item.findMany();",
      "  await getOrgContext();",
      "  return rows;",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("alias Prismy przez stałą modułu przed guardem → naruszenie", () => {
    const source = [
      'import { prisma } from "@/shared/lib/prisma";',
      "const db = prisma;",
      "export async function list() {",
      "  const rows = await db.item.findMany();",
      "  await getOrgContext();",
      "  return rows;",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([
      "a.ts#list",
    ]);
  });

  it("alias guardu przez stałą modułu przed Prismą → zgodne", () => {
    const source = [
      "const ctx = getOrgContext;",
      "export async function list() {",
      "  const { organizationId } = await ctx();",
      "  return prisma.item.findMany({ where: { organizationId } });",
      "}",
    ].join("\n");
    expect(findUnguardedEntrypoints("a.ts", source, anyFile)).toEqual([]);
  });
});

describe("findUnconfirmedServiceModeEntrypoints: aliasy przez stałe i podrobiony parametr", () => {
  it("alias Prismy przez stałą modułu zapisuje przed potwierdzeniem → naruszenie", () => {
    const source = [
      'import { prisma } from "@/shared/lib/prisma";',
      "const db = prisma;",
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  const row = await db.item.create({ data: { organizationId: context.organizationId } });",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return row;",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("alias getOrgContext przez stałą modułu bez potwierdzenia → naruszenie", () => {
    const source = [
      "const ctx = getOrgContext;",
      "export async function create(input, confirmation) {",
      "  await getAdminUserOrNull();",
      "  const { organizationId } = await ctx();",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("alias Prismy z importu pod inną nazwą zapisuje przed potwierdzeniem → naruszenie", () => {
    const source = [
      'import { client as store } from "@/shared/lib/prisma";',
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  const row = await store.item.create({ data: {} });",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return row;",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("parametr potwierdzenia z wartością domyślną → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation = { serviceModeConfirmed: true, organizationId: 'org-1' }) {",
      "  const context = await getOrgContext();",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return prisma.item.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("parametr potwierdzenia nadpisany w ciele funkcji przed potwierdzeniem → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  confirmation = { serviceModeConfirmed: true, organizationId: context.organizationId };",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return prisma.item.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("parametr potwierdzenia uzupełniony przez ??= → naruszenie", () => {
    const source = [
      "export async function create(input, confirmation) {",
      "  const context = await getOrgContext();",
      "  confirmation ??= { serviceModeConfirmed: true, organizationId: context.organizationId };",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return prisma.item.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("helper nadpisuje przekazany parametr potwierdzenia → naruszenie", () => {
    const source = [
      "async function confirmedContext(confirmation) {",
      "  const context = await getOrgContext();",
      "  confirmation = { serviceModeConfirmed: true, organizationId: context.organizationId };",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return context;",
      "}",
      "export async function create(input, confirmation) {",
      "  const { organizationId } = await confirmedContext(confirmation);",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("helper z wartością domyślną parametru potwierdzenia → naruszenie", () => {
    const source = [
      "async function confirmedContext(confirmation = { serviceModeConfirmed: true }) {",
      "  const context = await getOrgContext();",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return context;",
      "}",
      "export async function create(input, confirmation) {",
      "  const { organizationId } = await confirmedContext(confirmation);",
      "  return prisma.item.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#create"]);
  });

  it("parametr przekazany bez zmian i potwierdzony przed Prismą → zgodne", () => {
    const source = [
      'import { prisma as db } from "@/shared/lib/prisma";',
      "const ctx = getOrgContext;",
      "export async function create(input, confirmation) {",
      "  const context = await ctx();",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return db.item.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual([]);
  });
});

describe("findUnconfirmedServiceModeEntrypoints: requireModuleAccess jako źródło kontekstu", () => {
  it('akcja "use server" z requireModuleAccess i Prismą bez potwierdzenia → naruszenie', () => {
    const source = [
      '"use server";',
      "export async function createNote(input, confirmation) {",
      '  const { organizationId } = await requireModuleAccess("notes");',
      "  return prisma.note.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints(
        "a.ts",
        source,
        hasUseServerDirective,
      ),
    ).toEqual(["a.ts#createNote"]);
  });

  it('akcja "use server" z requireModuleAccess i potwierdzeniem przed Prismą → zgodne', () => {
    const source = [
      '"use server";',
      "export async function createNote(input, confirmation) {",
      '  const context = await requireModuleAccess("notes");',
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return prisma.note.create({ data: { organizationId: context.organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints(
        "a.ts",
        source,
        hasUseServerDirective,
      ),
    ).toEqual([]);
  });

  it("potwierdzenie po Prismie przy requireModuleAccess → naruszenie", () => {
    const source = [
      "export async function createNote(input, confirmation) {",
      '  const context = await requireModuleAccess("notes");',
      "  const note = await prisma.note.create({ data: { organizationId: context.organizationId } });",
      "  assertServiceModeConfirmed(context, confirmation);",
      "  return note;",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#createNote"]);
  });

  it("requireModuleAccess pod aliasem importu bez potwierdzenia → naruszenie", () => {
    const source = [
      'import { requireModuleAccess as access } from "@/shared/lib/auth/require-module-access";',
      "export async function createNote(input, confirmation) {",
      '  const { organizationId } = await access("notes");',
      "  return prisma.note.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#createNote"]);
  });

  it("requireModuleAccess przez stałą modułu bez potwierdzenia → naruszenie", () => {
    const source = [
      "const access = requireModuleAccess;",
      "export async function createNote(input, confirmation) {",
      '  const { organizationId } = await access("notes");',
      "  return prisma.note.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#createNote"]);
  });

  it("requireModuleAccess w lokalnym helperze bez potwierdzenia → naruszenie", () => {
    const source = [
      'async function context() { return requireModuleAccess("notes"); }',
      "export async function createNote(input, confirmation) {",
      "  const { organizationId } = await context();",
      "  return prisma.note.create({ data: { organizationId } });",
      "}",
    ].join("\n");
    expect(
      findUnconfirmedServiceModeEntrypoints("a.ts", source, anyFile),
    ).toEqual(["a.ts#createNote"]);
  });
});

describe("runCommand as a session guard and a service-mode confirmation", () => {
  const COMMAND_PREAMBLE = [
    '"use server";',
    'import { runCommand } from "@/shared/lib/commands/run-command";',
    'import { defineCommand } from "@/shared/lib/commands/define-command";',
    'const cmd = defineCommand({ key: "billing.archive", module: "billing", access: "member" });',
  ];

  const guardViolations = (source: string) =>
    findUnguardedEntrypoints("a.ts", source, hasUseServerDirective);

  const serviceModeViolations = (source: string) =>
    findUnconfirmedServiceModeEntrypoints(
      "a.ts",
      source,
      hasUseServerDirective,
    );

  it("an export returning runCommand(cmd, input, confirmation) passes both rules", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  return runCommand(cmd, input, confirmation);",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual([]);
    expect(serviceModeViolations(source)).toEqual([]);
  });

  it("an arrow export whose concise body is runCommand passes both rules", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export const archive = async (input, confirmation) => runCommand(cmd, input, confirmation);",
    ].join("\n");
    expect(guardViolations(source)).toEqual([]);
    expect(serviceModeViolations(source)).toEqual([]);
  });

  it("an export returning the awaited runCommand passes both rules", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  return await runCommand(cmd, input, confirmation);",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual([]);
    expect(serviceModeViolations(source)).toEqual([]);
  });

  it("runCommand imported under an alias passes both rules", () => {
    const source = [
      '"use server";',
      'import { runCommand as run } from "@/shared/lib/commands/run-command";',
      "export async function archive(input, confirmation) {",
      "  return run(cmd, input, confirmation);",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual([]);
    expect(serviceModeViolations(source)).toEqual([]);
  });

  it("a forged literal confirmation passed to runCommand is a service-mode violation", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      '  return runCommand(cmd, input, { serviceModeConfirmed: true, organizationId: "x" });',
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual([]);
    expect(serviceModeViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("a confirmation reassigned before runCommand is a service-mode violation", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      '  confirmation = { serviceModeConfirmed: true, organizationId: "x" };',
      "  return runCommand(cmd, input, confirmation);",
      "}",
    ].join("\n");
    expect(serviceModeViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("a confirmation parameter with a default value passed to runCommand is a service-mode violation", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      'export async function archive(input, confirmation = { serviceModeConfirmed: true, organizationId: "x" }) {',
      "  return runCommand(cmd, input, confirmation);",
      "}",
    ].join("\n");
    expect(serviceModeViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("runCommand without a confirmation argument is a service-mode violation", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  return runCommand(cmd, input);",
      "}",
    ].join("\n");
    expect(serviceModeViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("an awaited runCommand followed by Prisma is a guard violation", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  await runCommand(cmd, input, confirmation);",
      "  return prisma.item.deleteMany({});",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("an awaited runCommand stored in a variable and returned later is a guard violation", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  const result = await runCommand(cmd, input, confirmation);",
      "  return result;",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("runCommand chained with then before it is returned is a guard violation", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  return runCommand(cmd, input, confirmation).then((result) => result);",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("Prisma before the returned runCommand violates both rules", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  await prisma.item.findMany();",
      "  return runCommand(cmd, input, confirmation);",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
    expect(serviceModeViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("Prisma inside runCommand's arguments runs before it and violates both rules", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  return runCommand(cmd, await prisma.item.findFirst(), confirmation);",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
    expect(serviceModeViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("a function imported under the name runCommand from elsewhere is not a guard", () => {
    const source = [
      '"use server";',
      'import { noop as runCommand } from "./noop";',
      "export async function archive(input, confirmation) {",
      "  return runCommand(cmd, input, confirmation);",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("runCommand called as a property of another object is not a guard", () => {
    const source = [
      '"use server";',
      "export async function archive(input, confirmation) {",
      "  return commands.runCommand(cmd, input, confirmation);",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
  });

  it.each([
    [
      "an if without braces",
      [
        "  if (input.soft) return runCommand(cmd, input, confirmation);",
        "  return prisma.invoice.deleteMany({});",
      ],
    ],
    [
      "an if block",
      [
        "  if (input.soft) {",
        "    return runCommand(cmd, input, confirmation);",
        "  }",
        "  return prisma.invoice.deleteMany({});",
      ],
    ],
    [
      "a try with a finally that touches Prisma",
      [
        "  try {",
        "    return runCommand(cmd, input, confirmation);",
        "  } finally {",
        "    await prisma.invoice.deleteMany({});",
        "  }",
      ],
    ],
    [
      "the concise body of an inner arrow called after Prisma",
      [
        "  const later = () => runCommand(cmd, input, confirmation);",
        "  await prisma.invoice.deleteMany({});",
        "  return later();",
      ],
    ],
    [
      "the block body of an inner arrow called after Prisma",
      [
        "  const later = async () => {",
        "    return runCommand(cmd, input, confirmation);",
        "  };",
        "  await prisma.invoice.deleteMany({});",
        "  return later();",
      ],
    ],
    [
      "an awaited return in an if block",
      [
        "  if (input.soft) {",
        "    return await runCommand(cmd, input, confirmation);",
        "  }",
        "  return prisma.invoice.deleteMany({});",
      ],
    ],
    [
      "a bare block",
      [
        "  {",
        "    return runCommand(cmd, input, confirmation);",
        "  }",
        "  return prisma.invoice.deleteMany({});",
      ],
    ],
    [
      "a loop",
      [
        "  for (const item of input.items) {",
        "    return runCommand(cmd, item, confirmation);",
        "  }",
        "  return prisma.invoice.deleteMany({});",
      ],
    ],
    [
      "a switch case",
      [
        "  switch (input.mode) {",
        '    case "soft":',
        "      return runCommand(cmd, input, confirmation);",
        "  }",
        "  return prisma.invoice.deleteMany({});",
      ],
    ],
  ])("a runCommand returned from %s violates both rules", (_place, body) => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      ...body,
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
    expect(serviceModeViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("a runCommand returned only from an if, with no other access, is a guard violation", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export async function archive(input, confirmation) {",
      "  if (input.soft) return runCommand(cmd, input, confirmation);",
      "  return { success: false };",
      "}",
    ].join("\n");
    expect(guardViolations(source)).toEqual(["a.ts#archive"]);
  });

  it("an arrow export whose block body returns runCommand at its top level passes both rules", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export const archive = async (input, confirmation) => {",
      "  return runCommand(cmd, input, confirmation);",
      "};",
    ].join("\n");
    expect(guardViolations(source)).toEqual([]);
    expect(serviceModeViolations(source)).toEqual([]);
  });

  it("a function expression export returning runCommand at its top level passes both rules", () => {
    const source = [
      ...COMMAND_PREAMBLE,
      "export const archive = async function (input, confirmation) {",
      "  return runCommand(cmd, input, confirmation);",
      "};",
    ].join("\n");
    expect(guardViolations(source)).toEqual([]);
    expect(serviceModeViolations(source)).toEqual([]);
  });
});

describe("punkty wejścia serwera w src", () => {
  const files = listSourceFiles(SRC)
    .map((path) => ({
      path: relative(process.cwd(), path),
      source: readFileSync(path, "utf8"),
    }))
    .filter(({ path, source }) =>
      isServerEntrypoint(
        ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true),
      ),
    );

  it("skan obejmuje znane akcje serwerowe i queries", () => {
    expect(files.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "src/features/users/services/commands/invite-user-command.ts",
        "src/features/auth/services/commands/change-password-command.ts",
        "src/features/organizations/services/queries/organization-queries.ts",
        "src/features/users/services/queries/user-account-queries.ts",
      ]),
    );
  });

  it("każda eksportowana akcja i query wywołuje guard sesji przed dostępem do Prismy", () => {
    const violations = files.flatMap(({ path, source }) =>
      findUnguardedEntrypoints(path, source, isServerEntrypoint),
    );
    expect(violations).toEqual([]);
  });

  it('każda akcja "use server" z getOrgContext potwierdza tryb serwisowy przed dostępem do Prismy', () => {
    const violations = files.flatMap(({ path, source }) =>
      findUnconfirmedServiceModeEntrypoints(
        path,
        source,
        hasUseServerDirective,
      ),
    );
    expect(violations).toEqual([]);
  });

  it("inviteUserCommand returns runCommand(inviteUser, input, confirmation) and both rules cover it without a violation", () => {
    const path = "src/features/users/services/commands/invite-user-command.ts";
    const invite = files.find((entry) => entry.path === path);
    expect(invite).toBeDefined();
    const source = invite?.source ?? "";
    const file = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const scope = scopeOf(file);
    const entry = scope.functions.get("inviteUserCommand");
    expect(entry?.exported).toBe(true);
    const fn = entry?.node;
    const body = fn && fn.body && ts.isBlock(fn.body) ? fn.body : undefined;
    const [statement] = body?.statements ?? [];
    expect(body?.statements).toHaveLength(1);
    const returned =
      statement && ts.isReturnStatement(statement)
        ? statement.expression
        : undefined;
    const call =
      returned && ts.isCallExpression(returned) ? returned : undefined;
    expect(call && localCalleeName(call)).toBe("runCommand");
    expect(call?.arguments.map((argument) => argument.getText())).toEqual([
      "inviteUser",
      "input",
      "confirmation",
    ]);
    expect(fn ? parameterNames(fn) : []).toEqual(["input", "confirmation"]);
    expect(scope.importedNames.get("runCommand")).toBe("runCommand");
    expect(source).toContain(
      'import { runCommand } from "@/shared/lib/commands/run-command";',
    );
    expect(source).toMatch(/const inviteUser = defineCommand\(\{/);
    expect(source).toContain('key: "users.invite"');
    expect(source).toContain('module: "users"');
    expect(source).toContain('access: "global-admin"');
    expect(
      fn
        ? serviceModeEventsOf(
            fn,
            scope,
            new Set(parameterNames(fn).filter((name) => name !== "")),
          )
        : [],
    ).toEqual(["orgContext", "confirmation"]);
    expect(accessesOf(fn as FunctionLike, scope)).toEqual([
      expect.objectContaining({ kind: "guard" }),
    ]);
    expect(
      findUnconfirmedServiceModeEntrypoints(
        path,
        source,
        hasUseServerDirective,
      ),
    ).toEqual([]);
    expect(findUnguardedEntrypoints(path, source, isServerEntrypoint)).toEqual(
      [],
    );
  });

  it("wyjątki z listy UNGUARDED_ALLOWED nadal istnieją", () => {
    const exported = files.flatMap(({ path, source }) => {
      const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      return [...collectFunctions(file)]
        .filter(([, fn]) => fn.exported)
        .map(([name]) => `${path}#${name}`);
    });
    expect(exported).toEqual(
      expect.arrayContaining([...UNGUARDED_ALLOWED.keys()]),
    );
  });
});
