// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MODULE_GUARDS,
  MODULE_GUARD_SOURCES,
  findModuleEntryPoints,
  findStaleAllowances,
  findUnguardedModuleEntryPoints,
} from "../../../scripts/lib/architecture/module-entry-points";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const IMPERSONATION_LOG_REASON =
  "logs with logger.info an impersonation performed by the better-auth admin plugin under /api/auth/*; disabling the users module does not disable those endpoints (only global admins can call them), so dropping the log when users is disabled would hide an impersonation";

const ALLOWED: ReadonlyMap<string, string> = new Map([
  [
    "src/app/api/healthcheck/route.ts#GET",
    "liveness probe, reads no module data",
  ],
  [
    "src/app/api/auth/[...all]/route.ts#GET",
    "better-auth handler of the core auth module, which cannot be disabled",
  ],
  [
    "src/app/api/auth/[...all]/route.ts#POST",
    "better-auth handler of the core auth module, which cannot be disabled",
  ],
  [
    "src/features/users/services/commands/impersonation-commands.ts#logImpersonationStartCommand",
    IMPERSONATION_LOG_REASON,
  ],
  [
    "src/features/users/services/commands/impersonation-commands.ts#logImpersonationStopCommand",
    IMPERSONATION_LOG_REASON,
  ],
]);

const NONE: ReadonlyMap<string, string> = new Map();

const BILLING_ROUTE = "src/app/api/billing/route.ts";
const BILLING_COMMAND = "src/features/billing/services/commands/a.ts";
const BILLING_PAGE_ACTIONS = "src/app/[locale]/(app)/billing/actions.ts";

const FIXTURE_KIT = {
  modules: {
    core: {
      manifest: {
        name: "core",
        files: ["src/app/*", "src/app/api/auth/**", "src/shared/**"],
      },
    },
    billing: {
      manifest: {
        name: "billing",
        files: [
          "src/features/billing/**",
          "src/app/api/billing/**",
          "src/app/[locale]/(app)/billing/**",
          "src/shared/lib/billing/**",
        ],
      },
    },
  },
  projectModules: {
    reports: {
      manifest: {
        name: "reports",
        files: ["src/features/reports/**", "src/app/api/reports/**"],
      },
    },
  },
};

const GUARD_IMPORTS: Record<string, string> = {
  requireModuleEnabled:
    'import { requireModuleEnabled } from "@/shared/lib/modules/require-module-enabled";',
  isModuleEnabled:
    'import { isModuleEnabled } from "@/shared/lib/modules/require-module-enabled";',
  requireModuleAccess:
    'import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";',
  runCommand: 'import { runCommand } from "@/shared/lib/commands/run-command";',
};

const E = GUARD_IMPORTS.requireModuleEnabled;
const I = GUARD_IMPORTS.isModuleEnabled;
const M = GUARD_IMPORTS.requireModuleAccess;
const H = 'import { handleCommandError } from "@/shared/utils/error-handling";';
const P = 'import { prisma } from "@/shared/lib/prisma";';

const routeGet = (imports: string, body: string) =>
  `${imports}\nexport async function GET() {\n${body}\n  return new Response("ok");\n}\n`;

const serverAction = (imports: string, body: string) =>
  `"use server";\n\n${imports}\nexport async function doIt() {\n${body}\n  return { success: true };\n}\n`;

describe("MODULE_GUARDS", () => {
  it("lists exactly the four module guards", () => {
    expect([...MODULE_GUARDS]).toEqual([
      "requireModuleAccess",
      "requireModuleEnabled",
      "isModuleEnabled",
      "runCommand",
    ]);
  });

  it("maps every module guard to the only path it may be imported from", () => {
    expect(MODULE_GUARD_SOURCES).toEqual({
      requireModuleAccess: "@/shared/lib/auth/require-module-access",
      requireModuleEnabled: "@/shared/lib/modules/require-module-enabled",
      isModuleEnabled: "@/shared/lib/modules/require-module-enabled",
      runCommand: "@/shared/lib/commands/run-command",
    });
  });
});

describe("module entry point detector on fixtures", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const writeKit = (kit: unknown) => {
    write(".wa/kit.json", JSON.stringify(kit, null, 2));
  };

  const removeKit = () => {
    fs.rmSync(path.join(root, ".wa"), { recursive: true, force: true });
  };

  const unguarded = () => findUnguardedModuleEntryPoints(root, NONE);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "module-entry-points-"));
    writeKit(FIXTURE_KIT);
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

    it("accepts a GET handler that awaits an imported requireModuleAccess", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleAccess}\nexport async function GET() {\n  await requireModuleAccess("billing");\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET handler that returns 404 when an imported isModuleEnabled is false", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.isModuleEnabled}\nexport async function GET() {\n  if (!isModuleEnabled("billing")) {\n    return new Response(null, { status: 404 });\n  }\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a GET handler that only calls runCommand", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.runCommand}\nexport async function GET() {\n  await runCommand("billing");\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

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
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport const POST = async () => {\n  requireModuleEnabled("billing");\n  return new Response("ok");\n};\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#POST`]);
      expect(unguarded()).toEqual([]);
    });

    it("accepts a guarded const function expression handler", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport const DELETE = async function () {\n  requireModuleEnabled("billing");\n  return new Response(null);\n};\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a guarded local function exported under a method name", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nfunction handler() {\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\nexport { handler as PUT };\n`,
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

    it("ignores a file under src/app whose name only starts with route.ts", () => {
      write(
        "src/app/api/billing/route.ts.bak",
        "export async function GET() {\n  return new Response(null);\n}\n",
      );

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it("reports an unguarded GET next to a top-level declaration without initializer", () => {
      write(
        BILLING_ROUTE,
        "let helper;\nexport async function GET() {\n  return new Response(String(helper));\n}\n",
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET exported as a declaration without initializer", () => {
      write(BILLING_ROUTE, "export let GET;\n");

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#GET`]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET built by a call that invokes the guard once at module load", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nimport { createHandler } from "./create-handler";\nexport const GET = createHandler(requireModuleEnabled("billing"));\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#GET`]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a re-export from another file even when a guarded local function has the same name", () => {
      write(
        BILLING_ROUTE,
        `${GUARD_IMPORTS.requireModuleEnabled}\nasync function handler() {\n  requireModuleEnabled("billing");\n  return new Response(null);\n}\nexport { handler as GET } from "./other";\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#GET`]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("does not treat a default export of a route file as an entry point", () => {
      write(
        BILLING_ROUTE,
        "export default function Page() {}\nexport async function GET() {\n  return new Response(null);\n}\n",
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#GET`]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("finds no entry point in a route file with only a default export", () => {
      write(BILLING_ROUTE, "export default function Page() {}\n");

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it('ignores a "use server" route.ts outside src/app and src/features', () => {
      write(
        "src/shared/route.ts",
        '"use server";\n\nexport async function run() {\n  return 1;\n}\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it('keeps the HTTP method filter in a route file that starts with "use server"', () => {
      write(
        BILLING_ROUTE,
        '"use server";\n\nexport async function helper() {\n  return 1;\n}\nexport async function GET() {\n  return new Response(null);\n}\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#GET`]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });
  });

  describe("export star", () => {
    it("treats export * in a route file as the entry point * and reports it", () => {
      write(BILLING_ROUTE, 'export * from "./handlers";\n');

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#*`]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#*`]);
    });

    it("reports export * in a route file next to a guarded GET, sorted before it", () => {
      write(
        BILLING_ROUTE,
        `${E}\nexport * from "./handlers";\nexport async function GET() {\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_ROUTE}#*`,
        `${BILLING_ROUTE}#GET`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_ROUTE}#*`]);
    });

    it('treats export * in a "use server" feature file as the entry point * and reports it', () => {
      write(BILLING_COMMAND, '"use server";\n\nexport * from "./handlers";\n');

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_COMMAND}#*`]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#*`]);
    });

    it('treats export * in a module-owned "use server" file under src/app as the entry point *', () => {
      write(
        BILLING_PAGE_ACTIONS,
        '"use server";\n\nexport * from "./handlers";\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_PAGE_ACTIONS}#*`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_PAGE_ACTIONS}#*`]);
    });
  });

  describe("guard before the first Prisma access", () => {
    it("reports a GET that queries Prisma before calling the guard", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${E}`,
          '  await prisma.invoice.findMany();\n  requireModuleEnabled("billing");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a server action that queries Prisma before calling requireModuleAccess", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${M}`,
          '  await prisma.invoice.findMany();\n  await requireModuleAccess("billing");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a GET that only reads the prisma identifier before the guard", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${E}`,
          '  const client = prisma;\n  requireModuleEnabled("billing");\n  await client.invoice.findMany();',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that uses Prisma imported under an alias before the guard", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `import { prisma as db } from "@/shared/lib/prisma";\n${E}`,
          '  await db.invoice.findMany();\n  requireModuleEnabled("billing");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that calls a local helper touching Prisma before the guard", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nasync function load() {\n  return prisma.invoice.findMany();\n}\nexport async function GET() {\n  await load();\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET whose local helper touches Prisma first and calls the guard after", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nasync function load() {\n  const rows = await prisma.invoice.findMany();\n  requireModuleEnabled("billing");\n  return rows;\n}\nexport async function GET() {\n  await load();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that reaches Prisma through two local helpers before the guard", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nfunction rows() {\n  return prisma.invoice.findMany();\n}\nfunction load() {\n  return rows();\n}\nexport async function GET() {\n  await load();\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that calls the guard before Prisma", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${E}`,
          '  requireModuleEnabled("billing");\n  await prisma.invoice.findMany();',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET that calls a guarding local helper before Prisma", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nfunction guard() {\n  requireModuleEnabled("billing");\n}\nexport async function GET() {\n  guard();\n  await prisma.invoice.findMany();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET whose local helper calls the guard first and Prisma after", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nasync function load() {\n  requireModuleEnabled("billing");\n  return prisma.invoice.findMany();\n}\nexport async function GET() {\n  await load();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET that calls a local helper without Prisma or guard before the guard", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nfunction label() {\n  return "invoices";\n}\nexport async function GET() {\n  label();\n  requireModuleEnabled("billing");\n  await prisma.invoice.findMany();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });
  });

  describe("module argument of the guard", () => {
    it("reports a feature server action guarded with another module's key", () => {
      write(
        BILLING_COMMAND,
        serverAction(E, '  requireModuleEnabled("auth");'),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("accepts a feature server action guarded with its own module's key", () => {
      write(
        BILLING_COMMAND,
        serverAction(E, '  requireModuleEnabled("billing");'),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a feature outside .wa/kit.json guarded with the key from its path", () => {
      const file = "src/features/zeta/services/commands/z.ts";
      write(file, serverAction(E, '  requireModuleEnabled("zeta");'));

      expect(unguarded()).toEqual([]);
    });

    it("reports a route guarded by requireModuleAccess with another module's key", () => {
      write(
        BILLING_ROUTE,
        routeGet(M, '  await requireModuleAccess("users");'),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a route guarded by requireModuleAccess with its owner's key", () => {
      write(
        BILLING_ROUTE,
        routeGet(M, '  await requireModuleAccess("billing");'),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a guard called with a parameter instead of a literal", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nexport async function doIt(key: string) {\n  requireModuleEnabled(key);\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("accepts a guard called with a top-level const holding the owner's key", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nconst MODULE_KEY = "billing";\nexport async function doIt() {\n  requireModuleEnabled(MODULE_KEY);\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a guard called with a top-level let holding the owner's key", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nlet MODULE_KEY = "billing";\nexport async function doIt() {\n  requireModuleEnabled(MODULE_KEY);\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard called with a top-level const holding another module's key", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nconst MODULE_KEY = "auth";\nexport async function doIt() {\n  requireModuleEnabled(MODULE_KEY);\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard called without an argument", () => {
      write(BILLING_COMMAND, serverAction(E, "  requireModuleEnabled();"));

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard called with a template literal", () => {
      write(
        BILLING_COMMAND,
        serverAction(E, "  requireModuleEnabled(`billing`);"),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard called with the file path instead of the module key", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  requireModuleEnabled("src/features/billing/services/commands/a.ts");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("accepts a route owned by a project module guarded with that module's key", () => {
      write(
        "src/app/api/reports/route.ts",
        routeGet(E, '  requireModuleEnabled("reports");'),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a route owned by a project module guarded with another module's key", () => {
      write(
        "src/app/api/reports/route.ts",
        routeGet(E, '  requireModuleEnabled("billing");'),
      );

      expect(unguarded()).toEqual(["src/app/api/reports/route.ts#GET"]);
    });

    it("reports a route that no module owns whatever key it passes", () => {
      write(
        "src/app/api/other/route.ts",
        routeGet(E, '  requireModuleEnabled("other");'),
      );

      expect(unguarded()).toEqual(["src/app/api/other/route.ts#GET"]);
    });

    it("reports a guarded route when .wa/kit.json is missing", () => {
      removeKit();
      write(BILLING_ROUTE, routeGet(E, '  requireModuleEnabled("billing");'));

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it.each(["auth", "core", "billing"])(
      'reports a core-owned route under src/app/api/auth guarded with "%s"',
      (key) => {
        write(
          "src/app/api/auth/session/route.ts",
          routeGet(E, `  requireModuleEnabled("${key}");`),
        );

        expect(unguarded()).toEqual(["src/app/api/auth/session/route.ts#GET"]);
      },
    );

    it("accepts a route deep under a module's ** glob guarded with that module's key", () => {
      write(
        "src/app/api/billing/invoices/[id]/route.ts",
        routeGet(E, '  requireModuleEnabled("billing");'),
      );

      expect(unguarded()).toEqual([]);
    });

    it("matches [locale] and (app) in a glob literally", () => {
      write(
        BILLING_PAGE_ACTIONS,
        serverAction(E, '  requireModuleEnabled("billing");'),
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_PAGE_ACTIONS}#doIt`,
      ]);
      expect(unguarded()).toEqual([]);
    });

    it("does not read [locale] as a character class or (app) as a group", () => {
      const file = "src/app/l/app/billing/actions.ts";
      write(file, serverAction(E, '  requireModuleEnabled("billing");'));

      expect(findModuleEntryPoints(root)).toEqual([`${file}#doIt`]);
      expect(unguarded()).toEqual([`${file}#doIt`]);
    });

    it("does not let a single * in a glob cross a path separator", () => {
      writeKit({
        modules: {
          flags: {
            manifest: { name: "flags", files: ["src/app/api/*/route.ts"] },
          },
        },
      });
      write(
        "src/app/api/flags/route.ts",
        routeGet(E, '  requireModuleEnabled("flags");'),
      );
      write(
        "src/app/api/v2/flags/route.ts",
        routeGet(E, '  requireModuleEnabled("flags");'),
      );

      expect(unguarded()).toEqual(["src/app/api/v2/flags/route.ts#GET"]);
    });
  });

  describe("isModuleEnabled form", () => {
    it("reports isModuleEnabled called as an ignored statement", () => {
      write(BILLING_ROUTE, routeGet(I, '  isModuleEnabled("billing");'));

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports an awaited isModuleEnabled whose result is ignored", () => {
      write(BILLING_ROUTE, routeGet(I, '  await isModuleEnabled("billing");'));

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports isModuleEnabled stored in a variable and checked later", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  const on = isModuleEnabled("billing");\n  if (!on) {\n    return new Response(null, { status: 404 });\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a negated isModuleEnabled whose block returns 404", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (!isModuleEnabled("billing")) {\n    return new Response(null, { status: 404 });\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a negated isModuleEnabled followed by a return without a block", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (!isModuleEnabled("billing")) return new Response(null);',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a negated isModuleEnabled whose block throws", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (!isModuleEnabled("billing")) {\n    throw new Error("off");\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a negated isModuleEnabled in a server action that returns an error result", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          I,
          '  if (!isModuleEnabled("billing")) {\n    return { success: false, error: "off" };\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports isModuleEnabled in an if without the negation", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (isModuleEnabled("billing")) {\n    return new Response(null, { status: 404 });\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a negated isModuleEnabled whose block does not exit", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (!isModuleEnabled("billing")) {\n    console.log("off");\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a negated isModuleEnabled whose block returns only before its last statement", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (!isModuleEnabled("billing")) {\n    if (Date.now() > 0) {\n      return new Response(null);\n    }\n    console.log("off");\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a negated isModuleEnabled combined with another condition", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (!isModuleEnabled("billing") || Date.now() < 0) return new Response(null);',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a negated isModuleEnabled with an empty block", () => {
      write(
        BILLING_ROUTE,
        routeGet(I, '  if (!isModuleEnabled("billing")) {\n  }'),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a negated isModuleEnabled with another module's key", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (!isModuleEnabled("auth")) {\n    return new Response(null, { status: 404 });\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET whose local helper only returns when isModuleEnabled is false", () => {
      write(
        BILLING_ROUTE,
        `${I}\nfunction check() {\n  if (!isModuleEnabled("billing")) {\n    return new Response(null);\n  }\n}\nexport async function GET() {\n  check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET whose local helper throws when isModuleEnabled is false", () => {
      write(
        BILLING_ROUTE,
        `${I}\nfunction check() {\n  if (!isModuleEnabled("billing")) {\n    throw new Error("off");\n  }\n}\nexport async function GET() {\n  check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });
  });

  describe("nested functions", () => {
    it("reports a guard inside an arrow function stored but never run by the handler body", () => {
      write(
        BILLING_ROUTE,
        routeGet(E, '  const later = () => requireModuleEnabled("billing");'),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a guard inside a function declared in the handler body", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          E,
          '  function inner() {\n    requireModuleEnabled("billing");\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a guard inside a function declared and called in the handler body", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          E,
          '  function inner() {\n    requireModuleEnabled("billing");\n  }\n  inner();',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a guard inside a forEach callback", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          E,
          '  [1].forEach(() => {\n    requireModuleEnabled("billing");\n  });',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a guard inside a class method declared in the handler body", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          E,
          '  class Gate {\n    check() {\n      requireModuleEnabled("billing");\n    }\n  }\n  new Gate().check();',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a guard inside an object method declared in the handler body", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          E,
          '  const gate = {\n    check() {\n      requireModuleEnabled("billing");\n    },\n  };\n  gate.check();',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a guard after a nested callback that touches Prisma", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${E}`,
          '  const load = () => prisma.invoice.findMany();\n  requireModuleEnabled("billing");\n  await load();',
        ),
      );

      expect(unguarded()).toEqual([]);
    });
  });

  describe("guard inside try and catch", () => {
    it("reports a guard in a try whose catch is empty", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  try {\n    requireModuleEnabled("billing");\n  } catch {}',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard in a try whose catch returns a plain result", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    return { success: false };\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("accepts a guard in a try whose catch rethrows", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    throw error;\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a guard in a try whose catch logs and then rethrows", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    console.error(error);\n    throw error;\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a guard in a try whose catch returns handleCommandError", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${E}\n${H}`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    return handleCommandError(error, "x");\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a guard in a try whose catch returns an aliased handleCommandError", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${E}\nimport { handleCommandError as handle } from "@/shared/utils/error-handling";`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    return handle(error, "x");\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a guard in a try whose catch returns handleCommandError imported from another path", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${E}\nimport { handleCommandError } from "@/shared/utils/other";`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    return handleCommandError(error, "x");\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard in a try whose catch returns a local function named handleCommandError", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nfunction handleCommandError(_error: unknown, _message: string) {\n  return { success: false };\n}\nexport async function doIt() {\n  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    return handleCommandError(error, "x");\n  }\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard in a try whose catch calls handleCommandError without returning it", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${E}\n${H}`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    handleCommandError(error, "x");\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard in a try whose catch throws only before its last statement", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    if (Date.now() > 0) {\n      throw error;\n    }\n    return { success: false };\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("accepts a guard in a try with only a finally block", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  try {\n    requireModuleEnabled("billing");\n  } finally {\n    console.log("done");\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a guard called before a try whose catch swallows", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  requireModuleEnabled("billing");\n  try {\n    await prisma.invoice.findMany();\n  } catch {}',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a guard in an inner try that rethrows inside an outer try that swallows", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  try {\n    try {\n      requireModuleEnabled("billing");\n    } catch (error) {\n      throw error;\n    }\n  } catch {}',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard in an inner try that swallows inside an outer try that rethrows", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          E,
          '  try {\n    try {\n      requireModuleEnabled("billing");\n    } catch {}\n  } catch (error) {\n    throw error;\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guarding local helper called inside a try that swallows", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nfunction guard() {\n  requireModuleEnabled("billing");\n}\nexport async function doIt() {\n  try {\n    guard();\n  } catch {}\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a local helper whose guard sits in a try that swallows", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nfunction guard() {\n  try {\n    requireModuleEnabled("billing");\n  } catch {}\n}\nexport async function doIt() {\n  guard();\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });
  });

  describe("guard import path", () => {
    it("reports requireModuleEnabled imported from another path", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          'import { requireModuleEnabled } from "@/shared/lib/other";',
          '  requireModuleEnabled("billing");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports requireModuleAccess imported from the requireModuleEnabled path", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          'import { requireModuleAccess } from "@/shared/lib/modules/require-module-enabled";',
          '  await requireModuleAccess("billing");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports requireModuleEnabled imported from the requireModuleAccess path", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          'import { requireModuleEnabled } from "@/shared/lib/auth/require-module-access";',
          '  requireModuleEnabled("billing");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports isModuleEnabled imported from the requireModuleAccess path", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          'import { isModuleEnabled } from "@/shared/lib/auth/require-module-access";',
          '  if (!isModuleEnabled("billing")) {\n    return new Response(null, { status: 404 });\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a server action that only calls runCommand with its module's key", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          GUARD_IMPORTS.runCommand,
          '  await runCommand("billing");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });
  });

  describe("runCommand as a module guard", () => {
    const R = GUARD_IMPORTS.runCommand;
    const D =
      'import { defineCommand } from "@/shared/lib/commands/define-command";';
    const BILLING_CMD =
      'const cmd = defineCommand({ key: "billing.archive", module: "billing", access: "member" });';
    const ARCHIVE_SIGNATURE =
      "export async function archive(input: unknown, confirmation?: unknown) {";

    const commandFile = (preamble: string, body: string) =>
      `"use server";\n\n${preamble}\n${ARCHIVE_SIGNATURE}\n${body}\n}\n`;

    it("accepts an export that returns runCommand of a module-level command of its own module", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\n${BILLING_CMD}`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#archive`,
      ]);
      expect(unguarded()).toEqual([]);
    });

    it("accepts a command whose module is a module-level string constant equal to the owner", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nconst MODULE_KEY = "billing";\nconst cmd = defineCommand({ key: "billing.archive", module: MODULE_KEY, access: "member" });`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts an arrow export whose concise body is the runCommand call", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${R}\n${D}\n${BILLING_CMD}\nexport const archive = async (input: unknown, confirmation?: unknown) =>\n  runCommand(cmd, input, confirmation);\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts an export that returns the awaited runCommand call", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\n${BILLING_CMD}`,
          "  return await runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts runCommand and defineCommand imported under local aliases", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          'import { runCommand as run } from "@/shared/lib/commands/run-command";\nimport { defineCommand as command } from "@/shared/lib/commands/define-command";\nconst cmd = command({ key: "billing.archive", module: "billing", access: "member" });',
          "  return run(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a module route handler that returns runCommand of its own module's command", () => {
      write(
        BILLING_ROUTE,
        `${R}\n${D}\n${BILLING_CMD}\nexport async function POST(request: Request) {\n  return runCommand(cmd, await request.json(), undefined);\n}\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_ROUTE}#POST`]);
      expect(unguarded()).toEqual([]);
    });

    it("accepts a module-owned use server file under src/app that returns runCommand of its owner's command", () => {
      write(
        BILLING_PAGE_ACTIONS,
        commandFile(
          `${R}\n${D}\n${BILLING_CMD}`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports an export that returns runCommand of another module's command", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nconst cmd = defineCommand({ key: "auth.archive", module: "auth", access: "member" });`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command whose module is a module-level constant holding another module's key", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nconst MODULE_KEY = "auth";\nconst cmd = defineCommand({ key: "auth.archive", module: MODULE_KEY, access: "member" });`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command whose module is a module-level let holding the owner's key", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nlet MODULE_KEY = "billing";\nconst cmd = defineCommand({ key: "billing.archive", module: MODULE_KEY, access: "member" });`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command whose module is a template literal", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nconst cmd = defineCommand({ key: "billing.archive", module: \`billing\`, access: "member" });`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command defined without a module property", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nconst cmd = defineCommand({ key: "billing.archive", access: "member" });`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command defined from a variable instead of an object literal", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nconst definition = { key: "billing.archive", module: "billing", access: "member" };\nconst cmd = defineCommand(definition);`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command imported from another file", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\nimport { cmd } from "./archive-command";`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command held in a module-level let", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nlet cmd = defineCommand({ key: "billing.archive", module: "billing", access: "member" });`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command defined inside the exported function", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}`,
          '  const cmd = defineCommand({ key: "billing.archive", module: "billing", access: "member" });\n  return runCommand(cmd, input, confirmation);',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command defined by defineCommand imported from another path", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\nimport { defineCommand } from "@/shared/lib/define-command";\n${BILLING_CMD}`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command defined by a local function named defineCommand", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\nfunction defineCommand<T>(definition: T): T {\n  return definition;\n}\n${BILLING_CMD}`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports runCommand imported from another path", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `import { runCommand } from "@/shared/lib/run-command";\n${D}\n${BILLING_CMD}`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports an awaited runCommand followed by a Prisma call", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${P}\n${R}\n${D}\n${BILLING_CMD}`,
          "  await runCommand(cmd, input, confirmation);\n  return prisma.invoice.findMany();",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports an awaited runCommand stored in a variable and returned later", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\n${BILLING_CMD}`,
          "  const result = await runCommand(cmd, input, confirmation);\n  return result;",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a Prisma call before the returned runCommand", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${P}\n${R}\n${D}\n${BILLING_CMD}`,
          "  await prisma.invoice.findMany();\n  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports runCommand whose result is chained before it is returned", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\n${BILLING_CMD}`,
          "  return runCommand(cmd, input, confirmation).then((result) => result);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports an arrow export whose block body calls runCommand without returning it", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${R}\n${D}\n${BILLING_CMD}\nexport const archive = async (input: unknown, confirmation?: unknown) => {\n  await runCommand(cmd, input, confirmation);\n};\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports runCommand of the owner's command in a use server file under src/app that no module owns", () => {
      write(
        "src/app/x/actions.ts",
        commandFile(
          `${R}\n${D}\nconst cmd = defineCommand({ key: "x.archive", module: "x", access: "member" });`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual(["src/app/x/actions.ts#archive"]);
    });

    it("reports a command built by another define-command export aliased to defineCommand", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\nimport { defineCommandHooks as defineCommand } from "@/shared/lib/commands/define-command";\n${BILLING_CMD}`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a command defined by defineCommand called without arguments", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${R}\n${D}\nconst cmd = defineCommand();`,
          "  return runCommand(cmd, input, confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports runCommand called without arguments", () => {
      write(
        BILLING_COMMAND,
        commandFile(`${R}\n${D}\n${BILLING_CMD}`, "  return runCommand();"),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it.each([
      [
        "no module property",
        'const cmd = defineCommand({ key: "x.archive", access: "member" });',
      ],
      [
        "a module held in a let",
        'let MODULE_KEY = "x";\nconst cmd = defineCommand({ key: "x.archive", module: MODULE_KEY, access: "member" });',
      ],
      [
        "a template literal module",
        'const cmd = defineCommand({ key: "x.archive", module: `x`, access: "member" });',
      ],
    ])(
      "reports runCommand in a use server file under src/app that no module owns, for a command with %s",
      (_case, declaration) => {
        write(
          "src/app/x/actions.ts",
          commandFile(
            `${R}\n${D}\n${declaration}`,
            "  return runCommand(cmd, input, confirmation);",
          ),
        );

        expect(unguarded()).toEqual(["src/app/x/actions.ts#archive"]);
      },
    );

    it("reports a Prisma call inside runCommand's second argument", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${P}\n${R}\n${D}\n${BILLING_CMD}`,
          "  return runCommand(cmd, await prisma.item.findFirst(), confirmation);",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("reports a Prisma call inside runCommand's third argument only", () => {
      write(
        BILLING_COMMAND,
        commandFile(
          `${P}\n${R}\n${D}\n${BILLING_CMD}`,
          "  return runCommand(cmd, input, await prisma.item.findFirst());",
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
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

    it("ignores a feature file whose name only starts with a TypeScript extension", () => {
      write(`${BILLING_COMMAND}.bak`, `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it("reports a use server file that contains .test.ts in its name without ending with it", () => {
      const file =
        "src/features/billing/services/commands/latest.test.tsv-import.ts";
      write(
        file,
        '"use server";\n\nexport async function importRows() {\n  return 1;\n}\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([`${file}#importRows`]);
      expect(unguarded()).toEqual([`${file}#importRows`]);
    });

    it("skips holes in an exported array destructuring", () => {
      write(
        BILLING_COMMAND,
        '"use server";\n\nimport { actions } from "./actions";\nexport const [first, , second] = actions;\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#first`,
        `${BILLING_COMMAND}#second`,
      ]);
    });

    it("reports a use server feature file named route.ts exactly once", () => {
      const file = "src/features/billing/services/commands/route.ts";
      write(
        file,
        '"use server";\n\nexport async function run() {\n  return 1;\n}\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([`${file}#run`]);
      expect(unguarded()).toEqual([`${file}#run`]);
    });

    it("treats an anonymous default export of a use server file as the default entry point and reports it", () => {
      write(
        BILLING_COMMAND,
        '"use server";\n\nexport default async function () {\n  return 1;\n}\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#default`]);
    });

    it("accepts a guarded named default function export under the default id", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${GUARD_IMPORTS.requireModuleEnabled}\nexport default async function archive() {\n  requireModuleEnabled("billing");\n}\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
      ]);
      expect(unguarded()).toEqual([]);
    });

    it("reports an unguarded named default function export as default, not by its function name", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${GUARD_IMPORTS.requireModuleEnabled}\nexport default async function archive() {\n  return 1;\n}\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#default`]);
    });

    it("accepts a guarded local function exported as default by identifier", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${GUARD_IMPORTS.requireModuleEnabled}\nasync function archive() {\n  requireModuleEnabled("billing");\n}\nexport default archive;\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
      ]);
      expect(unguarded()).toEqual([]);
    });

    it("reports an unguarded local function exported as default by identifier", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${GUARD_IMPORTS.requireModuleEnabled}\nasync function archive() {\n  return 1;\n}\nexport default archive;\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#default`]);
    });

    it("accepts a guarded arrow function default export", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${GUARD_IMPORTS.requireModuleEnabled}\nexport default async () => {\n  requireModuleEnabled("billing");\n};\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
      ]);
      expect(unguarded()).toEqual([]);
    });

    it("reports an unguarded arrow function default export", () => {
      write(
        BILLING_COMMAND,
        '"use server";\n\nexport default async () => 1;\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#default`]);
    });

    it("reports a default export built by a call that invokes the guard once at module load", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${GUARD_IMPORTS.requireModuleEnabled}\nimport { createAction } from "./create-action";\nexport default createAction(requireModuleEnabled("billing"));\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#default`]);
    });

    it("lists a default export next to named exports, sorted", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${COMMAND_BODY}export default async function () {\n  return 1;\n}\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#default`,
        `${BILLING_COMMAND}#doIt`,
      ]);
      expect(unguarded()).toEqual([
        `${BILLING_COMMAND}#default`,
        `${BILLING_COMMAND}#doIt`,
      ]);
    });

    it("an allowance for the default id hides an unguarded default export", () => {
      write(
        BILLING_COMMAND,
        '"use server";\n\nexport default async function archive() {\n  return 1;\n}\n',
      );

      expect(
        findUnguardedModuleEntryPoints(
          root,
          new Map([[`${BILLING_COMMAND}#archive`, "reason"]]),
        ),
      ).toEqual([`${BILLING_COMMAND}#default`]);
      expect(
        findUnguardedModuleEntryPoints(
          root,
          new Map([[`${BILLING_COMMAND}#default`, "reason"]]),
        ),
      ).toEqual([]);
    });

    it("still reports a named export of a use server file under its own name", () => {
      write(
        BILLING_COMMAND,
        '"use server";\n\nexport async function archive() {\n  return 1;\n}\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_COMMAND}#archive`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#archive`]);
    });

    it("ignores a use server file in src/shared owned by core", () => {
      write("src/shared/lib/actions.ts", `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it("ignores a use server file in src/shared when .wa/kit.json is missing", () => {
      removeKit();
      write("src/shared/lib/actions.ts", `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([]);
    });
  });

  describe("server action files outside src/features", () => {
    const COMMAND_BODY =
      "export async function doIt() {\n  return { success: true };\n}\n";

    it('reports an unguarded export of a module-owned "use server" file under src/app', () => {
      write(BILLING_PAGE_ACTIONS, `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([
        `${BILLING_PAGE_ACTIONS}#doIt`,
      ]);
      expect(unguarded()).toEqual([`${BILLING_PAGE_ACTIONS}#doIt`]);
    });

    it("ignores a module-owned file under src/app without the directive", () => {
      write(BILLING_PAGE_ACTIONS, COMMAND_BODY);

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it('reports a "use server" file under src/app that no module owns', () => {
      write("src/app/x/actions.ts", `"use server";\n\n${COMMAND_BODY}`);

      expect(findModuleEntryPoints(root)).toEqual([
        "src/app/x/actions.ts#doIt",
      ]);
      expect(unguarded()).toEqual(["src/app/x/actions.ts#doIt"]);
    });

    it('reports a guarded "use server" file under src/app that no module owns', () => {
      write(
        "src/app/x/actions.ts",
        serverAction(E, '  requireModuleEnabled("x");'),
      );

      expect(unguarded()).toEqual(["src/app/x/actions.ts#doIt"]);
    });

    it.each(["src/app/x/__tests__/a.ts", "src/app/x/a.test.ts"])(
      "skips test file %s under src/app",
      (file) => {
        write(file, `"use server";\n\n${COMMAND_BODY}`);

        expect(findModuleEntryPoints(root)).toEqual([]);
        expect(unguarded()).toEqual([]);
      },
    );

    it('reports an unguarded export of a "use server" file in src/shared owned by a module', () => {
      write(
        "src/shared/lib/billing/actions.ts",
        `"use server";\n\n${COMMAND_BODY}`,
      );

      expect(findModuleEntryPoints(root)).toEqual([
        "src/shared/lib/billing/actions.ts#doIt",
      ]);
      expect(unguarded()).toEqual(["src/shared/lib/billing/actions.ts#doIt"]);
    });

    it('accepts a guarded export of a "use server" file in src/shared owned by a module', () => {
      write(
        "src/shared/lib/billing/actions.ts",
        serverAction(E, '  requireModuleEnabled("billing");'),
      );

      expect(findModuleEntryPoints(root)).toEqual([
        "src/shared/lib/billing/actions.ts#doIt",
      ]);
      expect(unguarded()).toEqual([]);
    });
  });

  describe("edge cases from the mutation review", () => {
    it("treats prisma imported from a relative path as a Prisma access before the guard", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${E}\nimport { prisma } from "../../../shared/lib/prisma";`,
          '  await prisma.invoice.findMany();\n  requireModuleEnabled("billing");',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("takes the owner from src/features only at the start of the path", () => {
      const file = "src/app/api/x/src/features/billing/route.ts";
      write(file, routeGet(E, '  requireModuleEnabled("billing");'));

      expect(unguarded()).toEqual([
        "src/app/api/x/src/features/billing/route.ts#GET",
      ]);
    });

    it("applies the HTTP method filter only to a file named exactly route.ts", () => {
      const file = "src/app/api/billing/route.ts.actions.ts";
      write(
        file,
        '"use server";\n\nexport async function doIt() {\n  return { success: true };\n}\n',
      );

      expect(unguarded()).toEqual([
        "src/app/api/billing/route.ts.actions.ts#doIt",
      ]);
    });

    it("reports an unowned file guarded with a parameter as the key", () => {
      write(
        "src/app/x/actions.ts",
        `"use server";\n\n${E}\nexport async function doIt(moduleKey: string) {\n  requireModuleEnabled(moduleKey);\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual(["src/app/x/actions.ts#doIt"]);
    });

    it("reports an unowned file guarded without an argument", () => {
      write(
        "src/app/x/actions.ts",
        serverAction(E, "  requireModuleEnabled();"),
      );

      expect(unguarded()).toEqual(["src/app/x/actions.ts#doIt"]);
    });

    it("reports isModuleEnabled under a prefix operator other than the negation", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          I,
          '  if (+isModuleEnabled("billing")) {\n    return new Response(null, { status: 404 });\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a guard in a try whose catch returns another function from the error-handling module", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${E}\nimport { handleCommandError, logCommandError } from "@/shared/utils/error-handling";`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    return logCommandError(error);\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("finds no entry point in an empty feature file and does not throw", () => {
      write("src/features/billing/services/commands/empty.ts", "");

      expect(findModuleEntryPoints(root)).toEqual([]);
      expect(unguarded()).toEqual([]);
    });

    it("reports a guard keyed by a declared const without an initializer", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\ndeclare const MODULE_KEY: string;\nexport async function doIt() {\n  requireModuleEnabled(MODULE_KEY);\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a guard keyed by a const initialised with an identifier", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nimport { billing } from "./keys";\nconst MODULE_KEY = billing;\nexport async function doIt() {\n  requireModuleEnabled(MODULE_KEY);\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it('treats export * as a namespace in a "use server" file as an entry point and reports it', () => {
      write(
        BILLING_COMMAND,
        '"use server";\n\nexport * as tools from "./tools";\n',
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_COMMAND}#tools`]);
      expect(unguarded()).toEqual([`${BILLING_COMMAND}#tools`]);
    });

    it("passes namespace re-exports of a route file through the HTTP method filter", () => {
      write(
        BILLING_ROUTE,
        'export * as GET from "./x";\nexport * as helpers from "./y";\n',
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a guard in a try whose catch returns nothing", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          E,
          '  try {\n    requireModuleEnabled("billing");\n  } catch {\n    return;\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("ignores a kit module entry without a manifest", () => {
      writeKit({
        ...FIXTURE_KIT,
        modules: { ...FIXTURE_KIT.modules, legacy: {} },
      });
      write(BILLING_ROUTE, routeGet(E, '  requireModuleEnabled("billing");'));

      expect(unguarded()).toEqual([]);
    });

    it('does not treat an exported type of a "use server" file as an entry point', () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nexport type Input = { id: string };\nexport async function doIt() {\n  requireModuleEnabled("billing");\n  return { success: true };\n}\n`,
      );

      expect(findModuleEntryPoints(root)).toEqual([`${BILLING_COMMAND}#doIt`]);
      expect(unguarded()).toEqual([]);
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
        "src/app/api/billing/invoices/route.ts",
        `${GUARD_IMPORTS.requireModuleEnabled}\nexport async function GET() {\n  requireModuleEnabled("billing");\n  return new Response(null);\n}\n`,
      );

      expect(
        findStaleAllowances(
          root,
          new Map([["src/app/api/billing/invoices/route.ts#GET", "reason"]]),
        ),
      ).toEqual([]);
    });
  });

  describe("awaiting async guards", () => {
    it("reports a server action that calls requireModuleAccess without await before Prisma", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${P}\n${M}\nexport async function wipe() {\n  requireModuleAccess("billing");\n  await prisma.invoice.deleteMany({});\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#wipe`]);
    });

    it("reports a GET that calls requireModuleAccess without await", () => {
      write(BILLING_ROUTE, routeGet(M, '  requireModuleAccess("billing");'));

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that discards requireModuleAccess with void", () => {
      write(
        BILLING_ROUTE,
        routeGet(M, '  void requireModuleAccess("billing");'),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that awaits requireModuleAccess only through a swallowing catch", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          M,
          '  await requireModuleAccess("billing").catch(() => null);',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that stores the requireModuleAccess promise and awaits it later", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          M,
          '  const pending = requireModuleAccess("billing");\n  await pending;',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that runs requireModuleAccess in parallel with Prisma", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${M}`,
          '  await Promise.all([requireModuleAccess("billing"), prisma.invoice.findMany()]);',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that returns requireModuleAccess without await", () => {
      write(
        BILLING_ROUTE,
        `${M}\nexport async function GET() {\n  return requireModuleAccess("billing");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that assigns the awaited requireModuleAccess before Prisma", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${M}`,
          '  const context = await requireModuleAccess("billing");\n  await prisma.invoice.findMany();',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET that returns the awaited requireModuleAccess", () => {
      write(
        BILLING_ROUTE,
        `${M}\nexport async function GET() {\n  return await requireModuleAccess("billing");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET that awaits the synchronous requireModuleEnabled before Prisma", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${E}`,
          '  await requireModuleEnabled("billing");\n  await prisma.invoice.findMany();',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET that skips an unawaited requireModuleAccess and then awaits it", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${M}`,
          '  requireModuleAccess("billing");\n  await requireModuleAccess("billing");\n  await prisma.invoice.findMany();',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a server action that calls an async guarding helper without await before Prisma", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${P}\n${E}\nasync function check() {\n  requireModuleEnabled("billing");\n}\nexport async function wipe() {\n  check();\n  await prisma.invoice.deleteMany({});\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#wipe`]);
    });

    it("accepts a server action that awaits an async guarding helper before Prisma", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${P}\n${E}\nasync function check() {\n  requireModuleEnabled("billing");\n}\nexport async function wipe() {\n  await check();\n  await prisma.invoice.deleteMany({});\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a GET that calls an async arrow guarding helper without await", () => {
      write(
        BILLING_ROUTE,
        `${E}\nconst check = async () => {\n  requireModuleEnabled("billing");\n};\nexport async function GET() {\n  check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that awaits an async arrow guarding helper", () => {
      write(
        BILLING_ROUTE,
        `${E}\nconst check = async () => {\n  requireModuleEnabled("billing");\n};\nexport async function GET() {\n  await check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a GET that calls an async function expression guarding helper without await", () => {
      write(
        BILLING_ROUTE,
        `${E}\nconst check = async function () {\n  requireModuleEnabled("billing");\n};\nexport async function GET() {\n  check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that awaits an async function expression guarding helper", () => {
      write(
        BILLING_ROUTE,
        `${E}\nconst check = async function () {\n  requireModuleEnabled("billing");\n};\nexport async function GET() {\n  await check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a GET that calls without await an async helper awaiting requireModuleAccess", () => {
      write(
        BILLING_ROUTE,
        `${M}\nasync function check() {\n  await requireModuleAccess("billing");\n}\nexport async function GET() {\n  check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that awaits an async helper awaiting requireModuleAccess", () => {
      write(
        BILLING_ROUTE,
        `${M}\nasync function check() {\n  await requireModuleAccess("billing");\n}\nexport async function GET() {\n  await check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a GET that awaits an async helper calling requireModuleAccess without await", () => {
      write(
        BILLING_ROUTE,
        `${M}\nasync function check() {\n  requireModuleAccess("billing");\n}\nexport async function GET() {\n  await check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that awaits a sync helper returning requireModuleAccess without await", () => {
      write(
        BILLING_ROUTE,
        `${M}\nfunction check() {\n  return requireModuleAccess("billing");\n}\nexport async function GET() {\n  await check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that calls without await an async helper wrapping a sync guarding helper", () => {
      write(
        BILLING_ROUTE,
        `${E}\nfunction inner() {\n  requireModuleEnabled("billing");\n}\nasync function outer() {\n  inner();\n}\nexport async function GET() {\n  outer();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that awaits an async helper wrapping a sync guarding helper", () => {
      write(
        BILLING_ROUTE,
        `${E}\nfunction inner() {\n  requireModuleEnabled("billing");\n}\nasync function outer() {\n  inner();\n}\nexport async function GET() {\n  await outer();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a GET whose sync helper calls an async guarding helper without await", () => {
      write(
        BILLING_ROUTE,
        `${E}\nasync function inner() {\n  requireModuleEnabled("billing");\n}\nfunction outer() {\n  inner();\n}\nexport async function GET() {\n  outer();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that returns an async guarding helper without await", () => {
      write(
        BILLING_ROUTE,
        `${E}\nasync function check() {\n  requireModuleEnabled("billing");\n}\nexport async function GET() {\n  return check();\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that discards an async guarding helper with void", () => {
      write(
        BILLING_ROUTE,
        `${E}\nasync function check() {\n  requireModuleEnabled("billing");\n}\nexport async function GET() {\n  void check();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a server action that awaits an async guarding helper inside a swallowing try", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nasync function check() {\n  requireModuleEnabled("billing");\n}\nexport async function doIt() {\n  try {\n    await check();\n  } catch {}\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a GET that calls an async Prisma helper without await before the guard", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nasync function load() {\n  return prisma.invoice.findMany();\n}\nexport async function GET() {\n  load();\n  requireModuleEnabled("billing");\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that calls a sync guarding helper without await before Prisma", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nfunction check() {\n  requireModuleEnabled("billing");\n}\nexport async function GET() {\n  check();\n  await prisma.invoice.findMany();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a GET that skips an unawaited async guarding helper and then awaits it", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${E}\nasync function check() {\n  requireModuleEnabled("billing");\n}\nexport async function GET() {\n  check();\n  await check();\n  await prisma.invoice.findMany();\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });
  });

  describe("Prisma on the guard's failure path", () => {
    it("reports a GET that touches Prisma in the block run when isModuleEnabled is false", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${I}`,
          '  if (!isModuleEnabled("billing")) {\n    await prisma.invoice.deleteMany({});\n    return new Response(null, { status: 404 });\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("reports a GET that calls a Prisma helper in the block run when isModuleEnabled is false", () => {
      write(
        BILLING_ROUTE,
        `${P}\n${I}\nasync function wipe() {\n  await prisma.invoice.deleteMany({});\n}\nexport async function GET() {\n  if (!isModuleEnabled("billing")) {\n    await wipe();\n    return new Response(null, { status: 404 });\n  }\n  return new Response("ok");\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_ROUTE}#GET`]);
    });

    it("accepts a GET that touches Prisma only in the else branch of the isModuleEnabled check", () => {
      write(
        BILLING_ROUTE,
        routeGet(
          `${P}\n${I}`,
          '  if (!isModuleEnabled("billing")) {\n    return new Response(null, { status: 404 });\n  } else {\n    await prisma.invoice.findMany();\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a server action that touches Prisma in the catch of the guard's try before rethrowing", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    await prisma.invoice.deleteMany({});\n    throw error;\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a server action that touches Prisma in the catch of the guard's try before handleCommandError", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}\n${H}`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    await prisma.invoice.deleteMany({});\n    return handleCommandError(error, "x");\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a server action that calls a Prisma helper in the catch of the guard's try", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${P}\n${E}\nasync function wipe() {\n  await prisma.invoice.deleteMany({});\n}\nexport async function doIt() {\n  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    await wipe();\n    throw error;\n  }\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a server action that touches Prisma in the finally of the guard's try", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  try {\n    requireModuleEnabled("billing");\n  } finally {\n    await prisma.invoice.deleteMany({});\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a server action that touches Prisma in the finally of a try whose catch holds the guard", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  try {\n    JSON.parse("{}");\n  } catch (error) {\n    requireModuleEnabled("billing");\n    throw error;\n  } finally {\n    await prisma.invoice.deleteMany({});\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("reports a server action that touches Prisma in the catch of an outer try enclosing the guard's try", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  try {\n    try {\n      requireModuleEnabled("billing");\n    } catch (error) {\n      throw error;\n    }\n  } catch (error) {\n    await prisma.invoice.deleteMany({});\n    throw error;\n  }',
        ),
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("accepts a server action whose Prisma catch belongs to a try that does not enclose the guard", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  requireModuleEnabled("billing");\n  try {\n    await prisma.invoice.findMany();\n  } catch (error) {\n    await prisma.invoice.deleteMany({});\n    throw error;\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a server action whose catch only declares a function touching Prisma before rethrowing", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    const later = () => prisma.invoice.deleteMany({});\n    throw error;\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("reports a server action whose guarding helper touches Prisma in the catch of the guard's try", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${P}\n${E}\nfunction check() {\n  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    prisma.invoice.deleteMany({});\n    throw error;\n  }\n}\nexport async function doIt() {\n  check();\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([`${BILLING_COMMAND}#doIt`]);
    });

    it("accepts a server action whose catch calls helpers that call each other without Prisma, and terminates", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\nfunction a(): void {\n  b();\n}\nfunction b(): void {\n  a();\n}\nexport async function doIt() {\n  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    a();\n    throw error;\n  }\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a server action that touches Prisma after a guard's try whose catch rethrows", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    throw error;\n  }\n  await prisma.invoice.findMany();',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a server action whose guard sits in a catch with Prisma after it in the same catch", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  try {\n    JSON.parse("{}");\n  } catch (error) {\n    requireModuleEnabled("billing");\n    await prisma.invoice.deleteMany({});\n    throw error;\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a server action whose guard sits in a finally with Prisma after it in the same finally", () => {
      write(
        BILLING_COMMAND,
        serverAction(
          `${P}\n${E}`,
          '  try {\n    JSON.parse("{}");\n  } finally {\n    requireModuleEnabled("billing");\n    await prisma.invoice.findMany();\n  }',
        ),
      );

      expect(unguarded()).toEqual([]);
    });

    it("accepts a server action whose catch calls a bodyless declared function before rethrowing", () => {
      write(
        BILLING_COMMAND,
        `"use server";\n\n${E}\ndeclare function log(): void;\nexport async function doIt() {\n  try {\n    requireModuleEnabled("billing");\n  } catch (error) {\n    log();\n    throw error;\n  }\n  return { success: true };\n}\n`,
      );

      expect(unguarded()).toEqual([]);
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

  it.skipIf(
    !["api-keys", "uploads"].every((key) =>
      fs.existsSync(path.join(repoRoot, "src/features", key, "module.ts")),
    ),
  )(
    "finds the public API route, the upload delete command and the invite command as entry points",
    () => {
      expect(findModuleEntryPoints(repoRoot)).toEqual(
        expect.arrayContaining([
          "src/app/api/v1/organization/route.ts#GET",
          "src/features/uploads/services/commands/upload-commands.ts#deleteUploadCommand",
          "src/features/users/services/commands/invite-user-command.ts#inviteUserCommand",
        ]),
      );
    },
  );

  it("finds no entry point in the auth and organizations features", () => {
    const skipped = findModuleEntryPoints(repoRoot).filter(
      (entry: string) =>
        entry.startsWith("src/features/auth/") ||
        entry.startsWith("src/features/organizations/"),
    );

    expect(skipped).toEqual([]);
  });
});
