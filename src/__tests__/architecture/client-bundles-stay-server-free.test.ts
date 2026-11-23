// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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
});

describe("pliki klienckie w repo", () => {
  it("nie importują modułów serwerowych", () => {
    expect(checkClientBundles(repoRoot)).toEqual([]);
  });
});
