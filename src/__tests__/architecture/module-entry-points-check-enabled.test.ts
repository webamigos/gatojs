// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MODULE_GUARDS,
  findModuleEntryPoints,
  findStaleAllowances,
  findUnguardedModuleEntryPoints,
} from "../../../scripts/lib/architecture/module-entry-points";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const ALLOWED: ReadonlyMap<string, string> = new Map([
  [
    "src/app/api/healthcheck/route.ts#GET",
    "liveness probe, reads no module data",
  ],
  [
    "src/app/api/auth/[...all]/route.ts#GET",
    "better-auth handler of the auth module, which cannot be disabled",
  ],
  [
    "src/app/api/auth/[...all]/route.ts#POST",
    "better-auth handler of the auth module, which cannot be disabled",
  ],
  [
    "src/features/users/services/commands/impersonation-commands.ts#logImpersonationStartCommand",
    "audits impersonation that the better-auth admin plugin performs whatever the users module's state; dropping the record when users is disabled would hide an impersonation",
  ],
  [
    "src/features/users/services/commands/impersonation-commands.ts#logImpersonationStopCommand",
    "audits impersonation that the better-auth admin plugin performs whatever the users module's state; dropping the record when users is disabled would hide an impersonation",
  ],
]);

const NONE: ReadonlyMap<string, string> = new Map();

const BILLING_ROUTE = "src/app/api/billing/route.ts";
const BILLING_COMMAND = "src/features/billing/services/commands/a.ts";

const GUARD_IMPORTS: Record<string, string> = {
  requireModuleEnabled:
    'import { requireModuleEnabled } from "@/shared/lib/modules/require-module-enabled";',
  isModuleEnabled:
    'import { isModuleEnabled } from "@/shared/lib/modules/require-module-enabled";',
  requireModuleAccess:
    'import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";',
  runCommand: 'import { runCommand } from "@/shared/lib/run-command";',
};

describe("MODULE_GUARDS", () => {
  it("lists exactly the four module guards", () => {
    expect([...MODULE_GUARDS]).toEqual([
      "requireModuleAccess",
      "requireModuleEnabled",
      "isModuleEnabled",
      "runCommand",
    ]);
  });
});

describe("module entry point detector on fixtures", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const unguarded = () => findUnguardedModuleEntryPoints(root, NONE);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "module-entry-points-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("route handlers", () => {
    it("reports a GET handler that calls no guard", () => {
      write(
        BILLING_ROUTE,
        'export async function GET() {\n  return new Response("ok");\n}\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#GET`]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET handler that calls an imported requireModuleEnabled", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport async function GET() {\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a guard imported under an alias and called by the alias", () => {
      write(
        BILLING_ROUTE,
        'import { requireModuleEnabled as ensure } from "@/shared/lib/modules/require-module-enabled";\nexport async function GET() {\n  ensure("billing");\n  return new Response("ok");\n}\n',
      );

      expect(unguarded()).toEqual([]);
    });

    it.each(["isModuleEnabled", "requireModuleAccess", "runCommand"])(
      "accepts a GET handler that calls an imported %s",
      (guard) => {
        write(
          BILLING_ROUTE,
          `${GUARD_IMPORTS[guard]}\nexport async function GET() {\n  await ${guard}("billing");\n  return new Response("ok");\n}\n`,
        );

        expect(unguarded()).toEqual([]);
      },
    );

    it("reports a handler that imports a guard but never calls it", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport const check = requireModuleEnabled;\nexport async function GET() {\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a call of an identifier imported under another name and aliased to a guard name", () => {
      write(
        BILLING_ROUTE,
        'import { noop as requireModuleEnabled } from "./noop";\nexport async function GET() {\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\n',
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that reaches the guard through a local async function", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nasync function guard() {\n  requireModuleEnabled("billing");\n}\nexport async function GET() {\n  await guard();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET that reaches the guard through two local functions", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nfunction inner() {\n  requireModuleEnabled("billing");\n}\nconst outer = () => {\n  inner();\n};\nexport async function GET() {\n  outer();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a GET whose local helpers call each other without a guard and terminates", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nfunction a(): void {\n  b();\n}\nfunction b(): void {\n  a();\n}\nexport async function GET() {\n  a();\n  return new Response("ok");\n}\nexport function unused() {\n  requireModuleEnabled("billing");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET whose guarded local function is never called", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nfunction guard() {\n  requireModuleEnabled("billing");\n}\nexport async function GET() {\n  return new Response(String(guard));\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a call of a local function that only shares the guard's name", () => {
      write(
        BILLING_ROUTE,
        'function requireModuleEnabled(_key: string): void {}\nexport async function GET() {\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\n',
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("does not treat runtime and dynamic config exports as entry points", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport const runtime = "nodejs";\nexport const dynamic = "force-dynamic";\nexport async function helper() {\n  return 1;\n}\nexport async function GET() {\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#GET`]);
      expect(unguarded()).toEqual([]);
    });

    it.each(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])(
      "treats an exported %s as an entry point",
      (method) => {
        write(
          BILLING_ROUTE,
          `export async function ${method}() {\n  return new Response(null);\n}\n`,
        );

        expect(findModuleEntryPoints(root)).toEqual([
          `${BILLING_ROUTE}#${method}`,
        ]);
      },
    );

    it("reports handlers exported through destructuring", () => {
      write(
        BILLING_ROUTE,
        'import { handlers } from "./handlers";\nexport const { GET, POST } = handlers;\n',
      );

      expect(unguarded()).toEqual([
        `${BILLING_ROUTE}#GET`,
        `${BILLING_ROUTE}#POST`,
      ]);
    });

    it("reports a handler re-exported from another file", () => {
      write(BILLING_ROUTE, 'export { GET } from "./x";\n');

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#GET`]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a handler exported as a non-function value", () => {
      write(
        BILLING_ROUTE,
        'import { handlers } from "./handlers";\nexport const GET = handlers.GET;\n',
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a guarded const arrow handler", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport const POST = async () => {\n  requireModuleEnabled("x");\n  return new Response("ok");\n};\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#POST`]);
      expect(unguarded()).toEqual([]);
    });

    it("accepts a guarded const function expression handler", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport const DELETE = async function () {\n  requireModuleEnabled("x");\n  return new Response(null);\n};\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a guarded local function exported under a method name", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nfunction handler() {\n  requireModuleEnabled("x");\n  return new Response("ok");\n}\nexport { handler as PUT };\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#PUT`]);
      expect(unguarded()).toEqual([]);
    });

    it("reports an unguarded local function exported under a method name", () => {
      write(
        BILLING_ROUTE,
        'function handler() {\n  return new Response("ok");\n}\nexport { handler as PUT };\n',
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#PUT`]);
    });

    it("scans route.tsx files under src/app", () => {
      write(
        "src/app/og/route.tsx",
        "export async function GET() {\n  return new Response(null);\n}\n",
      );

      expect(findModuleEntryPoints(root)).toEqual(["src/app/og/route.tsx#GET"]);
    });

    it("ignores files under src/app that are not route files", () => {
      write(
        "src/app/billing/handler.ts",
        "export async function GET() {\n  return new Response(null);\n}\n",
      );
      write(
        "src/shared/lib/route.ts",
        "export async function GET() {\n  return new Response(null);\n}\n",
      );

      expect(findModuleEntryPoints(root)).toEqual([]);
    });
  });

  describe("server action files", () => {
    const COMMAND_BODY =
      "export async function doIt() {\n  return { success: true };\n}\n";

    it('reports an unguarded export of a "use server" file', () => {
      write(BILLING_COMMAND, `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_COMMAND}#doIt`]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("accepts a guarded export of a use server file", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${GUARD_IMPORTS.requireModuleEnabled}\nexport async function doIt() {\n  requireModuleEnabled("billing");\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("treats every exported name of a use server file as an entry point", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${COMMAND_BODY}export const other = async () => ({ success: true });\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#doIt`,
        `${BILLING_COMMAND}#other`,
      ]);
    });

    it("scans use server .tsx files", () => {
      write(
        "src/features/billing/services/commands/b.tsx",
        `"use server";\n\n${COMMAND_BODY}`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        "src/features/billing/services/commands/b.tsx#doIt",
      ]);
    });

    it("ignores a feature file without the directive", () => {
      write(BILLING_COMMAND, COMMAND_BODY);

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it("ignores a directive that is not the first statement", () => {
      write(
        BILLING_COMMAND,
        `import { z } from "zod";\n"use server";\nexport const schema = z.string();\n${COMMAND_BODY}`,
      );

      expect(findModuleEntryPoints(root)).toEqual([]);
    });

    it.each([
      "src/features/auth/services/commands/a.ts",
      "src/features/organizations/services/commands/a.ts",
    ])("skips %s, whose module cannot be disabled", (file) => {
      write(file, `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it.each([
      "src/features/billing/services/commands/__tests__/a.ts",
      "src/features/billing/services/commands/a.test.ts",
    ])("skips test file %s", (file) => {
      write(file, `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([]);
    });

    it("ignores use server files outside src/features", () => {
      write("src/shared/lib/actions.ts", `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([]);
    });
  });

  describe("sorting", () => {
    it("returns entry points sorted whatever the creation order", () => {
      write(
        "src/features/zeta/services/commands/z.ts",
        `"use server";\n\nexport async function doIt() {\n  return 1;\n}\n`,
      );
      write(
        "src/app/api/alpha/route.ts",
        "export async function POST() {\n  return new Response(null);\n}\nexport async function GET() {\n  return new Response(null);\n}\n",
      );

      const expected = [
        "src/app/api/alpha/route.ts#GET",
        "src/app/api/alpha/route.ts#POST",
        "src/features/zeta/services/commands/z.ts#doIt",
      ];
      expect(findModuleEntryPoints(root)).toEqual(expected);
      expect(unguarded()).toEqual(expected);
    });
  });

  describe("allow map", () => {
    beforeEach(() => {
      write(
        BILLING_ROUTE,
        'export async function GET() {\n  return new Response("ok");\n}\n',
      );
    });

    it("an allowed entry point is not reported", () => {
      expect(
        findUnguardedModuleEntryPoints(
          root,
          new Map([[`${BILLING_ROUTE}#GET`, "reason"]]),
        ),
      ).toEqual([]);
    });

    it("an allowance for another entry point does not hide this one", () => {
      expect(
        findUnguardedModuleEntryPoints(
          root,
          new Map([[`${BILLING_ROUTE}#POST`, "reason"]]),
        ),
      ).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("an allowance naming an existing entry point is not stale", () => {
      expect(
        findStaleAllowances(
          root,
          new Map([[`${BILLING_ROUTE}#GET`, "reason"]]),
        ),
      ).toEqual([]);
    });

    it("reports allowances that name no entry point, sorted", () => {
      expect(
        findStaleAllowances(
          root,
          new Map([
            ["src/app/api/gone/route.ts#GET", "reason"],
            [`${BILLING_ROUTE}#GET`, "reason"],
            ["src/app/api/archive/route.ts#POST", "reason"],
          ]),
        ),
      ).toEqual([
        "src/app/api/archive/route.ts#POST",
        "src/app/api/gone/route.ts#GET",
      ]);
    });

    it("an allowance for a guarded entry point still names an entry point and is not stale", () => {
      write(
        "src/app/api/safe/route.ts",
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport async function GET() {\n  requireModuleEnabled("x");\n  return new Response(null);\n}\n`,
      );

      expect(
        findStaleAllowances(
          root,
          new Map([["src/app/api/safe/route.ts#GET", "reason"]]),
        ),
      ).toEqual([]);
    });
  });
});

describe("module entry points of this repository", () => {
  it("every entry point of a module that can be disabled reaches a module guard", () => {
    expect(findUnguardedModuleEntryPoints(repoRoot, ALLOWED)).toEqual([]);
  });

  it("every allowance names an existing entry point", () => {
    expect(findStaleAllowances(repoRoot, ALLOWED)).toEqual([]);
  });

  it("finds the public API route as an entry point when it exists", () => {
    const route = "src/app/api/v1/organization/route.ts";
    if (!fs.existsSync(path.join(repoRoot, route))) {
      return;
    }

    expect(findModuleEntryPoints(repoRoot)).toContain(`${route}#GET`);
  });

  it("finds no entry point in the auth and organizations features", () => {
    const skipped = findModuleEntryPoints(repoRoot).filter(
      (entry: string) =>
        entry.startsWith("src/features/auth/") ||
        entry.startsWith("src/features/organizations/"),
    );

    expect(skipped).toEqual([]);
  });
});
