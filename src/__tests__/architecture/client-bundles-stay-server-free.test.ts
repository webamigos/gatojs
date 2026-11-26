// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLIENT_ENTRY_FILES,
  CLIENT_SAFE_AUTH_MODULES,
  checkClientBundles,
  findServerImportsInClient,
  isClientModule,
} from "../../../scripts/lib/architecture/client-imports";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const client = (body: string) => `"use client";\n${body}`;

describe("isClientModule", () => {
  it.each([
    '"use client";\nexport const a = 1;',
    "'use client';\nexport const a = 1;",
    '"use client"\nexport const a = 1;',
    "'use client'",
  ])("dyrektywa jako pierwsza instrukcja: %j", (source) => {
    expect(isClientModule(source)).toBe(true);
  });

  it("dyrektywa dalej w pliku się nie liczy", () => {
    expect(
      isClientModule('import { a } from "./a";\n"use client";\nexport { a };'),
    ).toBe(false);
  });

  it("napis use client w treści funkcji się nie liczy", () => {
    expect(
      isClientModule('export function f() {\n  "use client";\n  return 1;\n}'),
    ).toBe(false);
  });

  it("dyrektywa use server to nie moduł kliencki", () => {
    expect(isClientModule('"use server";\nexport async function a() {}')).toBe(
      false,
    );
  });

  it("plik bez dyrektyw to nie moduł kliencki", () => {
    expect(isClientModule("export const a = 1;")).toBe(false);
  });
});

describe("CLIENT_ENTRY_FILES", () => {
  it("lists the project config, the config helper and the component overrides library as client entries", () => {
    expect([...CLIENT_ENTRY_FILES].sort()).toEqual([
      "src/gato.config.ts",
      "src/shared/lib/modules/component-overrides.ts",
      "src/shared/lib/modules/gato-config.ts",
    ]);
  });
});

describe("findServerImportsInClient", () => {
  it("prisma w pliku klienckim to naruszenie", () => {
    expect(
      findServerImportsInClient(
        '"use client";\nimport { prisma } from "@/shared/lib/prisma";',
      ),
    ).toEqual(["@/shared/lib/prisma"]);
  });

  it("ten sam import bez use client nie jest naruszeniem", () => {
    expect(
      findServerImportsInClient(
        'import { prisma } from "@/shared/lib/prisma";',
      ),
    ).toEqual([]);
  });

  it("use client dalej w pliku nie czyni importu naruszeniem", () => {
    expect(
      findServerImportsInClient(
        'import { prisma } from "@/shared/lib/prisma";\n"use client";\n',
      ),
    ).toEqual([]);
  });

  it("klient auth jest dozwolony", () => {
    expect(
      findServerImportsInClient(
        client('import { authClient } from "@/shared/lib/auth/client";'),
      ),
    ).toEqual([]);
  });

  it("role i uprawnienia auth są dozwolone", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { ROLES } from "@/shared/lib/auth/roles";\nimport { can } from "@/shared/lib/auth/permissions";',
        ),
      ),
    ).toEqual([]);
  });

  it("lista modułów auth bezpiecznych dla klienta ma dokładnie trzy pozycje", () => {
    expect([...CLIENT_SAFE_AUTH_MODULES].sort()).toEqual([
      "@/shared/lib/auth/client",
      "@/shared/lib/auth/permissions",
      "@/shared/lib/auth/roles",
    ]);
  });

  it("pozostałe moduły auth są zakazane", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { auth } from "@/shared/lib/auth";\nimport { getOrgContext } from "@/shared/lib/auth/org-context";\nimport { x } from "@/shared/lib/auth/client-extra";',
        ),
      ),
    ).toEqual([
      "@/shared/lib/auth",
      "@/shared/lib/auth/org-context",
      "@/shared/lib/auth/client-extra",
    ]);
  });

  it("node:* jest zakazane", () => {
    expect(
      findServerImportsInClient(client('import fs from "node:fs";')),
    ).toEqual(["node:fs"]);
  });

  it("env, wygenerowana prisma i server-only są zakazane", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { env } from "@/env";\nimport { Prisma } from "@/generated/prisma";\nimport { Role } from "@/generated/prisma/enums";\nimport "server-only";',
        ),
      ),
    ).toEqual([
      "@/env",
      "@/generated/prisma",
      "@/generated/prisma/enums",
      "server-only",
    ]);
  });

  it("@gatojs/env and its subpaths are forbidden in a client module", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { checkEnv } from "@gatojs/env";\nimport { httpUrl } from "@gatojs/env/fragments";',
        ),
      ),
    ).toEqual(["@gatojs/env", "@gatojs/env/fragments"]);
  });

  it("segment boundary: @/environment and @gatojs/environment are not forbidden", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { a } from "@/environment";\nimport { b } from "@gatojs/environment";\nimport { c } from "@/envs/x";',
        ),
      ),
    ).toEqual([]);
  });

  it("granica segmentu: @/shared/lib/prismatic nie jest zakazane", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { a } from "@/shared/lib/prismatic";\nimport { b } from "@/shared/lib/environment";\nimport { c } from "@/shared/lib/authz";',
        ),
      ),
    ).toEqual([]);
  });

  it("podścieżka prisma jest zakazana", () => {
    expect(
      findServerImportsInClient(
        client('import { x } from "@/shared/lib/prisma/extension";'),
      ),
    ).toEqual(["@/shared/lib/prisma/extension"]);
  });

  it("import typu jest ignorowany", () => {
    expect(
      findServerImportsInClient(
        client(
          'import type { User } from "@/generated/prisma";\nimport type { Session } from "@/shared/lib/auth";\nexport type { Org } from "@/shared/lib/auth/org-context";',
        ),
      ),
    ).toEqual([]);
  });

  it("liczy import efektu ubocznego, re-eksport i dynamiczny import z literałem", () => {
    expect(
      findServerImportsInClient(
        client(
          'import "server-only";\nexport { prisma } from "@/shared/lib/prisma";\nexport * from "@/env";\nconst load = () => import("node:crypto");',
        ),
      ),
    ).toEqual(["server-only", "@/shared/lib/prisma", "@/env", "node:crypto"]);
  });

  it("dynamiczny import modułu serwerowego to naruszenie", () => {
    expect(
      findServerImportsInClient(
        client(
          "export async function f() {\n  const { prisma } = await import('@/shared/lib/prisma');\n  return prisma;\n}",
        ),
      ),
    ).toEqual(["@/shared/lib/prisma"]);
  });

  it("import wieloliniowy jest rozpoznawany", () => {
    expect(
      findServerImportsInClient(
        client('import {\n  a,\n  b,\n} from "@/shared/lib/auth/org-context";'),
      ),
    ).toEqual(["@/shared/lib/auth/org-context"]);
  });

  it("tekst import(...) w JSX nie jest dynamicznym importem", () => {
    expect(
      findServerImportsInClient(
        '"use client";\nexport const A = () => <p>import("node:fs")</p>;',
      ),
    ).toEqual([]);
  });

  it("the events library and its subpaths are server modules for a client file", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { emitEvent } from "@/shared/lib/events";\nimport { emitEvent as e } from "@/shared/lib/events/emit-event";',
        ),
      ),
    ).toEqual(["@/shared/lib/events", "@/shared/lib/events/emit-event"]);
  });

  it("a feature's events.ts and subscribers.ts are server modules for a client file", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { events } from "@/features/invoices/events";\nimport { subscribers } from "@/features/invoices/subscribers";',
        ),
      ),
    ).toEqual([
      "@/features/invoices/events",
      "@/features/invoices/subscribers",
    ]);
  });

  it("a dynamic import of a feature's subscribers in a client file is a violation", () => {
    expect(
      findServerImportsInClient(
        client(
          'export const load = () => import("@/features/billing/subscribers");',
        ),
      ),
    ).toEqual(["@/features/billing/subscribers"]);
  });

  it("names that only start like events or subscribers are not server modules", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { a } from "@/features/invoices/events-list";\nimport { b } from "@/features/invoices/components/events";\nimport { c } from "@/shared/lib/eventsource";\nimport { d } from "@/features/invoices/subscribers-table";\nimport { e } from "@/features/invoices/components/subscribers";',
        ),
      ),
    ).toEqual([]);
  });

  it("the same events imports without use client are not violations", () => {
    expect(
      findServerImportsInClient(
        'import { emitEvent } from "@/shared/lib/events";\nimport { emitEvent as e } from "@/shared/lib/events/emit-event";\nimport { events } from "@/features/invoices/events";\nimport { subscribers } from "@/features/invoices/subscribers";',
      ),
    ).toEqual([]);
  });

  it("a type-only import from the events library in a client file is allowed", () => {
    expect(
      findServerImportsInClient(
        client(
          'import type { DomainEvent } from "@/shared/lib/events";\nimport type { events } from "@/features/invoices/events";',
        ),
      ),
    ).toEqual([]);
  });

  it("a feature's slots.ts is a server module for a client file", () => {
    expect(
      findServerImportsInClient(
        client('import { slots } from "@/features/invoices/slots";'),
      ),
    ).toEqual(["@/features/invoices/slots"]);
  });

  it("a dynamic import of a feature's slots.ts in a client file is a violation", () => {
    expect(
      findServerImportsInClient(
        client(
          'export const load = () => import("@/features/invoices/slots");',
        ),
      ),
    ).toEqual(["@/features/invoices/slots"]);
  });

  it("a feature's client-slots.ts and names that only start like slots are not server modules", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { clientSlots } from "@/features/invoices/client-slots";\nimport { a } from "@/features/invoices/slots-list";\nimport { b } from "@/features/invoices/components/slots";\nimport { c } from "@/shared/lib/modules/slots";',
        ),
      ),
    ).toEqual([]);
  });

  it("a specifier that only ends like a feature's slots path is not a server module", () => {
    expect(
      findServerImportsInClient(
        client('import x from "vendor/@/features/invoices/slots";'),
      ),
    ).toEqual([]);
  });

  it("a specifier that only contains a feature's services path is not a server module", () => {
    expect(
      findServerImportsInClient(
        client(
          'import x from "vendor/@/features/invoices/services/queries/list";',
        ),
      ),
    ).toEqual([]);
  });

  it("a type-only import from a feature's slots.ts in a client file is allowed", () => {
    expect(
      findServerImportsInClient(
        client('import type { slots } from "@/features/invoices/slots";'),
      ),
    ).toEqual([]);
  });

  it("a feature's services and anything below them are server modules for a client file, in order", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { list } from "@/features/invoices/services/queries/list";\nimport { service } from "@/features/invoices/services/invoice-service";',
        ),
      ),
    ).toEqual([
      "@/features/invoices/services/queries/list",
      "@/features/invoices/services/invoice-service",
    ]);
  });

  it("a feature's services root itself is a server module for a client file", () => {
    expect(
      findServerImportsInClient(
        client('import { all } from "@/features/invoices/services";'),
      ),
    ).toEqual(["@/features/invoices/services"]);
  });

  it("a feature's services/commands and below are allowed in a client file", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { create } from "@/features/invoices/services/commands/create";\nimport { commands } from "@/features/invoices/services/commands";',
        ),
      ),
    ).toEqual([]);
  });

  it("names that only start like services or commands are not exempt or forbidden by the prefix", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { a } from "@/features/invoices/services-list";\nimport { b } from "@/features/invoices/components/services";\nimport { c } from "@/features/invoices/services/commands-helpers";',
        ),
      ),
    ).toEqual(["@/features/invoices/services/commands-helpers"]);
  });

  it("a dynamic import of a feature's query in a client file is a violation", () => {
    expect(
      findServerImportsInClient(
        client(
          'export const load = () => import("@/features/invoices/services/queries/list");',
        ),
      ),
    ).toEqual(["@/features/invoices/services/queries/list"]);
  });

  it("the server slot host and the server module registry are server modules for a client file", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { Slot } from "@/shared/components/slot";\nimport { moduleSlots } from "@/modules.generated";',
        ),
      ),
    ).toEqual(["@/shared/components/slot", "@/modules.generated"]);
  });

  it("subpaths of the server slot host are server modules for a client file", () => {
    expect(
      findServerImportsInClient(
        client('import { Slot } from "@/shared/components/slot/index";'),
      ),
    ).toEqual(["@/shared/components/slot/index"]);
  });

  it("the slot error boundary, the client slot and the client registry are allowed in a client file", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { SlotErrorBoundary } from "@/shared/components/slot-error-boundary";\nimport { ClientSlot } from "@/shared/components/client-slot";\nimport { clientModuleSlots } from "@/modules.client.generated";',
        ),
      ),
    ).toEqual([]);
  });

  it("relative specifiers are ignored: the source has no path to resolve them against", () => {
    expect(
      findServerImportsInClient(
        client(
          'import { slots } from "./slots";\nimport { q } from "../services/queries/q";',
        ),
      ),
    ).toEqual([]);
  });

  it("zwraca naruszenia w kolejności wystąpienia", () => {
    expect(
      findServerImportsInClient(
        "'use client'\nimport fs from 'node:fs';\nimport { Button } from '@/components/ui/button';\nimport { prisma } from '@/shared/lib/prisma';",
      ),
    ).toEqual(["node:fs", "@/shared/lib/prisma"]);
  });
});

describe("checkClientBundles", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("pliki klienckie bez importów serwerowych przechodzą", () => {
    write(
      "src/a.tsx",
      client('import { authClient } from "@/shared/lib/auth/client";'),
    );
    write("src/server.ts", 'import { prisma } from "@/shared/lib/prisma";');
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("zgłasza plik .tsx z importem prismy", () => {
    write("src/x.tsx", client('import { prisma } from "@/shared/lib/prisma";'));
    expect(checkClientBundles(root)).toEqual([
      "src/x.tsx: @/shared/lib/prisma",
    ]);
  });

  it("zgłasza plik .ts w podkatalogu", () => {
    write(
      "src/features/a/components/use-x.ts",
      client('import { env } from "@/env";'),
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/a/components/use-x.ts: @/env",
    ]);
  });

  it("pomija src/generated i pliki spoza .ts/.tsx", () => {
    write("src/generated/prisma/x.ts", client('import "server-only";'));
    write("src/a.js", client('import "server-only";'));
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("pomija pliki, których nazwa tylko zawiera .tsx przed innym rozszerzeniem", () => {
    write("src/a.test.tsx.snap", client('import "server-only";'));
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("pomija katalog node_modules na dowolnej głębokości", () => {
    write("src/node_modules/a.tsx", client('import "server-only";'));
    write("src/features/x/node_modules/b.tsx", client('import "server-only";'));
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("nie pomija katalogów reports ani .next", () => {
    write(
      "src/features/reports/components/x.tsx",
      client('import { prisma } from "@/shared/lib/prisma";'),
    );
    write(
      "src/.next/a.tsx",
      client('import { prisma } from "@/shared/lib/prisma";'),
    );
    expect(checkClientBundles(root)).toEqual([
      "src/.next/a.tsx: @/shared/lib/prisma",
      "src/features/reports/components/x.tsx: @/shared/lib/prisma",
    ]);
  });

  it("sortuje wynik po ścieżce pliku jako napisie", () => {
    write("src/a/x.tsx", client('import "server-only";'));
    write("src/a.tsx", client('import "server-only";'));
    expect(checkClientBundles(root)).toEqual([
      "src/a.tsx: server-only",
      "src/a/x.tsx: server-only",
    ]);
  });

  it("nie czyta plików spoza src", () => {
    write("scripts/x.tsx", client('import "server-only";'));
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports src/gato.config.ts importing prisma without a use client directive", () => {
    write(
      "src/gato.config.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport default {};',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/gato.config.ts: @/shared/lib/prisma",
    ]);
  });

  it("reports src/shared/lib/modules/gato-config.ts importing env without a use client directive", () => {
    write(
      "src/shared/lib/modules/gato-config.ts",
      'import { env } from "@/env";\nexport const a = env;',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/shared/lib/modules/gato-config.ts: @/env",
    ]);
  });

  it("the same import in another file without use client is not reported", () => {
    write(
      "src/gato.config.backup.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport default {};',
    );
    write(
      "src/features/a/gato.config.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport default {};',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("src/gato.config.ts with only type imports of server modules passes", () => {
    write(
      "src/gato.config.ts",
      'import type { Session } from "@/shared/lib/auth";\nexport default {};',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("src/gato.config.ts with use client and a server import is reported once", () => {
    write("src/gato.config.ts", client('import "server-only";'));
    expect(checkClientBundles(root)).toEqual([
      "src/gato.config.ts: server-only",
    ]);
  });

  it("reports a client component importing a feature's events", () => {
    write(
      "src/features/invoices/components/issue-button.tsx",
      client('import { events } from "@/features/invoices/events";'),
    );
    write(
      "src/features/invoices/services/commands/issue.ts",
      'import { emitEvent } from "@/shared/lib/events";',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/invoices/components/issue-button.tsx: @/features/invoices/events",
    ]);
  });

  it("reports a static prisma import in a feature's client-slots.ts without a use client directive", () => {
    write(
      "src/features/x/client-slots.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport const clientSlots = [];',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/client-slots.ts: @/shared/lib/prisma",
    ]);
  });

  it("reports a dynamic prisma import in a feature's client-slots.ts", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("@/shared/lib/prisma") }];',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/client-slots.ts: @/shared/lib/prisma",
    ]);
  });

  it("reports a feature's client-slots.ts importing a feature's slots.ts", () => {
    write(
      "src/features/x/client-slots.ts",
      'import { slots } from "@/features/x/slots";\nexport const clientSlots = slots;',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/client-slots.ts: @/features/x/slots",
    ]);
  });

  it("reports every feature's client-slots.ts, sorted by path", () => {
    write(
      "src/features/zeta/client-slots.ts",
      'import { env } from "@/env";\nexport const clientSlots = [];',
    );
    write(
      "src/features/alpha/client-slots.ts",
      'import "server-only";\nexport const clientSlots = [];',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/alpha/client-slots.ts: server-only",
      "src/features/zeta/client-slots.ts: @/env",
    ]);
  });

  it("a feature's slots.ts is not a client entry: its server imports are not reported", () => {
    write(
      "src/features/x/slots.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport const slots = [{ component: () => import("@/shared/lib/prisma") }];',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a client-slots.ts outside the feature root is not a client entry", () => {
    write(
      "src/features/x/components/client-slots.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport const clientSlots = [];',
    );
    write(
      "src/client-slots.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport const clientSlots = [];',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a feature's client-slots.tsx is not a client entry: only client-slots.ts is", () => {
    write(
      "src/features/x/client-slots.tsx",
      'import { prisma } from "@/shared/lib/prisma";\nexport const clientSlots = [];',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a features/x/client-slots.ts nested below another directory of src is not a client entry", () => {
    write(
      "src/legacy/src/features/x/client-slots.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport const clientSlots = [];',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a feature's client-slots.ts with only type imports of server modules passes", () => {
    write(
      "src/features/x/client-slots.ts",
      'import type { Session } from "@/shared/lib/auth";\nexport const clientSlots = [];',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports a client component importing a feature's slots.ts", () => {
    write(
      "src/features/invoices/components/widget.tsx",
      client('import { slots } from "@/features/invoices/slots";'),
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/invoices/components/widget.tsx: @/features/invoices/slots",
    ]);
  });

  it("reports a relative ./slots in a feature's client-slots.ts as written", () => {
    write(
      "src/features/x/client-slots.ts",
      'import { slots } from "./slots";\nexport const clientSlots = slots;',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/client-slots.ts: ./slots",
    ]);
  });

  it("reports a lazy ../invoices/slots in a feature's client-slots.ts as written", () => {
    write(
      "src/features/notes/client-slots.ts",
      'export const clientSlots = [{ component: () => import("../invoices/slots") }];',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/notes/client-slots.ts: ../invoices/slots",
    ]);
  });

  it("reports ./slots.ts with the extension as written", () => {
    write(
      "src/features/x/client-slots.ts",
      'import { slots } from "./slots.ts";\nexport const clientSlots = slots;',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/client-slots.ts: ./slots.ts",
    ]);
  });

  it("reports ./slots.tsx with the extension as written", () => {
    write(
      "src/features/x/client-slots.ts",
      'import { slots } from "./slots.tsx";\nexport const clientSlots = slots;',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/client-slots.ts: ./slots.tsx",
    ]);
  });

  it("reports a relative query import in a use client component", () => {
    write(
      "src/features/x/components/w.tsx",
      client('import { q } from "../services/queries/q";'),
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/components/w.tsx: ../services/queries/q",
    ]);
  });

  it("a relative command import in a use client component passes", () => {
    write(
      "src/features/x/components/w.tsx",
      client('import { c } from "../services/commands/c";'),
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports a relative ./slot in a use client component next to the server slot host", () => {
    write(
      "src/shared/components/widget.tsx",
      client('import { Slot } from "./slot";'),
    );
    expect(checkClientBundles(root)).toEqual([
      "src/shared/components/widget.tsx: ./slot",
    ]);
  });

  it("reports a relative path to prisma from src/gato.config.ts", () => {
    write(
      "src/gato.config.ts",
      'import { prisma } from "./shared/lib/prisma";\nexport default {};',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/gato.config.ts: ./shared/lib/prisma",
    ]);
  });

  it("relative names that only start like slots or point to client-slots pass", () => {
    write(
      "src/features/x/client-slots.ts",
      'import { a } from "./slots-list";\nimport { b } from "./components/slots";\nimport { c } from "../x/client-slots";\nexport const clientSlots = [];',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a relative ./slots in a component without use client is not checked", () => {
    write(
      "src/features/x/components/card.tsx",
      'import { slots } from "./slots";\nexport const Card = () => null;',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports a lazy target of client-slots.ts without use client", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card") }];',
    );
    write(
      "src/features/x/components/card.tsx",
      "export default function Card() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/x/client-slots.ts: ./components/card (missing "use client")',
    ]);
  });

  it("a lazy target of client-slots.ts with use client as its first statement passes", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card") }];',
    );
    write(
      "src/features/x/components/card.tsx",
      client("export default function Card() {\n  return null;\n}"),
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a lazy target with use client later in the file is reported", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card") }];',
    );
    write(
      "src/features/x/components/card.tsx",
      'import { a } from "./a";\n"use client";\nexport default function Card() {\n  return a;\n}',
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/x/client-slots.ts: ./components/card (missing "use client")',
    ]);
  });

  it("reports a lazy @/ target without use client with the specifier as written", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("@/features/x/components/card") }];',
    );
    write(
      "src/features/x/components/card.tsx",
      "export default function Card() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/x/client-slots.ts: @/features/x/components/card (missing "use client")',
    ]);
  });

  it("reports a lazy .ts target without use client", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card") }];',
    );
    write(
      "src/features/x/components/card.ts",
      "export default function Card() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/x/client-slots.ts: ./components/card (missing "use client")',
    ]);
  });

  it("reports a lazy target resolved to index.tsx without use client", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card") }];',
    );
    write(
      "src/features/x/components/card/index.tsx",
      "export default function Card() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/x/client-slots.ts: ./components/card (missing "use client")',
    ]);
  });

  it("reports a lazy target resolved to index.ts without use client", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card") }];',
    );
    write(
      "src/features/x/components/card/index.ts",
      "export default function Card() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/x/client-slots.ts: ./components/card (missing "use client")',
    ]);
  });

  it("a lazy target resolved to index.tsx with use client passes", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card") }];',
    );
    write(
      "src/features/x/components/card/index.tsx",
      client("export default function Card() {\n  return null;\n}"),
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports a lazy target named with its extension without use client", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card.tsx") }];',
    );
    write(
      "src/features/x/components/card.tsx",
      "export default function Card() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/x/client-slots.ts: ./components/card.tsx (missing "use client")',
    ]);
  });

  it("a missing lazy target and a package lazy target are not reported", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [\n  { component: () => import("./components/nope") },\n  { component: () => import("some-lib") },\n];',
    );
    write("node_modules/some-lib/index.ts", "export default 1;");
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a package lazy target is not resolved against the client-slots.ts directory", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("some-lib") }];',
    );
    write(
      "src/features/x/some-lib.tsx",
      "export default function SomeLib() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a static import of a target without use client in client-slots.ts is not reported", () => {
    write(
      "src/features/x/client-slots.ts",
      'import "./components/card";\nexport const clientSlots = [];',
    );
    write(
      "src/features/x/components/card.tsx",
      "export default function Card() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a lazy target without use client of a use client component is not reported", () => {
    write(
      "src/features/x/components/w.tsx",
      client('export const load = () => import("./card");'),
    );
    write(
      "src/features/x/components/card.tsx",
      "export default function Card() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("a use client lazy target is checked as a client file: its prisma import is reported", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [{ component: () => import("./components/card") }];',
    );
    write(
      "src/features/x/components/card.tsx",
      client(
        'import { prisma } from "@/shared/lib/prisma";\nexport default function Card() {\n  return null;\n}',
      ),
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/components/card.tsx: @/shared/lib/prisma",
    ]);
  });

  it("lists import violations in order, then missing directives in order", () => {
    write(
      "src/features/x/client-slots.ts",
      'export const clientSlots = [\n  { component: () => import("./components/b") },\n  { component: () => import("./slots") },\n  { component: () => import("./components/a") },\n  { component: () => import("@/env") },\n];',
    );
    write("src/features/x/components/b.tsx", "export default () => null;");
    write("src/features/x/components/a.tsx", "export default () => null;");
    expect(checkClientBundles(root)).toEqual([
      "src/features/x/client-slots.ts: ./slots",
      "src/features/x/client-slots.ts: @/env",
      'src/features/x/client-slots.ts: ./components/b (missing "use client")',
      'src/features/x/client-slots.ts: ./components/a (missing "use client")',
    ]);
  });

  it("reports a static prisma import in a feature's components.ts without a use client directive", () => {
    write(
      "src/features/crm/components.ts",
      'import { prisma } from "@/shared/lib/prisma";\nexport const componentOverrides = [];',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/crm/components.ts: @/shared/lib/prisma",
    ]);
  });

  it("reports a dynamic prisma import in a feature's components.ts", () => {
    write(
      "src/features/crm/components.ts",
      'export const componentOverrides = [{ component: () => import("@/shared/lib/prisma") }];',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/crm/components.ts: @/shared/lib/prisma",
    ]);
  });

  it("reports a relative ./slots in a feature's components.ts as written", () => {
    write(
      "src/features/crm/components.ts",
      'import { slots } from "./slots";\nexport const componentOverrides = [];',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/features/crm/components.ts: ./slots",
    ]);
  });

  it("a feature's components.ts with only type imports of server modules passes", () => {
    write(
      "src/features/crm/components.ts",
      'import type { PrismaClient } from "@/generated/prisma";\nexport const componentOverrides = [];',
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports a lazy target of components.ts without use client", () => {
    write(
      "src/features/crm/components.ts",
      'export const componentOverrides = [{ component: () => import("./components/invite-dialog") }];',
    );
    write(
      "src/features/crm/components/invite-dialog.tsx",
      "export default function InviteDialog() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/crm/components.ts: ./components/invite-dialog (missing "use client")',
    ]);
  });

  it("a lazy target of components.ts with use client as its first statement passes", () => {
    write(
      "src/features/crm/components.ts",
      'export const componentOverrides = [{ component: () => import("./components/invite-dialog") }];',
    );
    write(
      "src/features/crm/components/invite-dialog.tsx",
      client("export default function InviteDialog() {\n  return null;\n}"),
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports a lazy @/ target of components.ts without use client with the specifier as written", () => {
    write(
      "src/features/crm/components.ts",
      'export const componentOverrides = [{ component: () => import("@/features/crm/components/invite-dialog") }];',
    );
    write(
      "src/features/crm/components/invite-dialog.tsx",
      "export default function InviteDialog() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/features/crm/components.ts: @/features/crm/components/invite-dialog (missing "use client")',
    ]);
  });

  it("files only named like a feature's components.ts are not client entries", () => {
    for (const file of [
      "src/features/crm/components/components.ts",
      "src/features/crm/components/invite-dialog.ts",
      "src/features/crm/components/index.ts",
      "src/features/crm/components.tsx",
      "src/components.ts",
      "src/legacy/src/features/crm/components.ts",
    ]) {
      write(file, 'import { prisma } from "@/shared/lib/prisma";');
    }
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports a lazy target of src/gato.config.ts without use client", () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.invite-dialog": { replace: () => import("./features/crm/components/invite-dialog") } } } } };',
    );
    write(
      "src/features/crm/components/invite-dialog.tsx",
      "export default function InviteDialog() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/gato.config.ts: ./features/crm/components/invite-dialog (missing "use client")',
    ]);
  });

  it("reports a lazy @/ target of src/gato.config.ts without use client", () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.invite-dialog": { wrap: () => import("@/features/crm/components/invite-dialog") } } } } };',
    );
    write(
      "src/features/crm/components/invite-dialog.tsx",
      "export default function InviteDialog() {\n  return null;\n}",
    );
    expect(checkClientBundles(root)).toEqual([
      'src/gato.config.ts: @/features/crm/components/invite-dialog (missing "use client")',
    ]);
  });

  it("a lazy target of src/gato.config.ts with use client passes", () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.invite-dialog": { replace: () => import("./features/crm/components/invite-dialog") } } } } };',
    );
    write(
      "src/features/crm/components/invite-dialog.tsx",
      client("export default function InviteDialog() {\n  return null;\n}"),
    );
    expect(checkClientBundles(root)).toEqual([]);
  });

  it("reports a server import in the component overrides library without a use client directive", () => {
    write(
      "src/shared/lib/modules/component-overrides.ts",
      'import { env } from "@/env";\nexport const a = env;',
    );
    expect(checkClientBundles(root)).toEqual([
      "src/shared/lib/modules/component-overrides.ts: @/env",
    ]);
  });

  it("a missing src/gato.config.ts is not an error", () => {
    write("src/a.ts", "export const a = 1;");
    expect(checkClientBundles(root)).toEqual([]);
  });
});

describe("pliki klienckie w repo", () => {
  it("nie importują modułów serwerowych", () => {
    expect(checkClientBundles(repoRoot)).toEqual([]);
  });
});
