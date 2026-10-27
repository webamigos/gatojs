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
    "wywoływane przez hook session.create.before z userId tworzonej sesji",
  ],
]);

type FunctionLike =
  ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

interface LocalFunction {
  node: FunctionLike;
  exported: boolean;
}

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
  return functions;
}

function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return null;
}

interface Access {
  kind: "guard" | "prisma";
  position: number;
}

function accessesOf(
  node: ts.Node,
  functions: Map<string, LocalFunction>,
  visiting: Set<string> = new Set(),
): Access[] {
  const found: Access[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isIdentifier(child) && child.text === "prisma") {
      found.push({ kind: "prisma", position: child.getStart() });
    }
    if (ts.isCallExpression(child)) {
      const name = calleeName(child);
      if (name && SESSION_GUARDS.has(name)) {
        found.push({ kind: "guard", position: child.getStart() });
      }
      const local = name ? functions.get(name) : undefined;
      if (name && local && !visiting.has(name)) {
        const inner = accessesOf(
          local.node,
          functions,
          new Set([...visiting, name]),
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
  const functions = collectFunctions(file);
  const violations: string[] = [];
  for (const [name, fn] of functions) {
    if (!fn.exported || UNGUARDED_ALLOWED.has(`${path}#${name}`)) {
      continue;
    }
    const [first] = accessesOf(fn.node, functions);
    if (first?.kind !== "guard") {
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
