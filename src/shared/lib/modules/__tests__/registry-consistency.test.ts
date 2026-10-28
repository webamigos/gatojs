import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/config";
import { clientModules } from "@/modules.client.generated";
import { moduleMessages } from "@/modules.generated";
import { canAccessModule } from "@/shared/lib/auth/permissions";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import type { ModuleDef } from "../define-module";
import { getNavEntries } from "../nav";

const USER_ROLES = ["user", "admin", "superadmin"] as const;
const ORG_ROLES = ["owner", "admin", "member", null] as const;
const MULTI_ORG_MODES = [false, true] as const;

const contexts: AccessContext[] = USER_ROLES.flatMap((userRole) =>
  ORG_ROLES.flatMap((orgRole) =>
    MULTI_ORG_MODES.map((multiOrg) => ({ userRole, orgRole, multiOrg })),
  ),
);

const registry: readonly ModuleDef[] = clientModules;

const navItems = registry.flatMap((moduleDef) =>
  moduleDef.nav.map((item) => ({ moduleKey: moduleDef.key, item })),
);

function valueAtPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, segment) => {
    if (typeof node !== "object" || node === null) {
      return undefined;
    }
    return (node as Record<string, unknown>)[segment];
  }, root);
}

describe("spójność rejestru modułów", () => {
  it("rejestr nie jest pusty, a macierz kontekstów ma 24 pozycje", () => {
    expect(clientModules.length).toBeGreaterThan(0);
    expect(contexts).toHaveLength(24);
  });

  it("klucze modułów w rejestrze są unikalne", () => {
    const keys = registry.map((moduleDef) => moduleDef.key);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual(
      [],
    );
  });

  it("href pozycji menu są unikalne w całym rejestrze", () => {
    const hrefs = navItems.map(({ item }) => item.href);
    expect(
      hrefs.filter((href, index) => hrefs.indexOf(href) !== index),
    ).toEqual([]);
  });

  it("każdy href pozycji menu zaczyna się od /", () => {
    expect(
      navItems
        .map(({ item }) => item.href)
        .filter((href) => !href.startsWith("/")),
    ).toEqual([]);
  });

  it("rejestr komunikatów ma wszystkie języki z konfiguracji", () => {
    expect(Object.keys(moduleMessages).sort()).toEqual([...locales].sort());
  });

  describe.each(locales)("język %s", (locale) => {
    it.each(navItems)(
      "moduł $moduleKey: etykieta pozycji $item.href istnieje w komunikatach",
      async ({ moduleKey, item }) => {
        const loader = moduleMessages[locale].find(
          (candidate) => candidate.key === moduleKey,
        );
        expect(loader, `brak loadera ${moduleKey}/${locale}`).toBeDefined();
        const messages = await loader?.load();
        const labelKeys = [item.labelKey, item.multiOrgLabelKey].filter(
          (key): key is string => key !== undefined,
        );
        for (const labelKey of labelKeys) {
          const label = valueAtPath(messages, labelKey);
          expect(typeof label, `${moduleKey}.${labelKey}`).toBe("string");
          expect((label as string).length).toBeGreaterThan(0);
        }
      },
    );
  });

  it.each(contexts)(
    "userRole=$userRole, orgRole=$orgRole, multiOrg=$multiOrg: href modułu jest w nawigacji wtedy i tylko wtedy, gdy canAccessModule",
    (context) => {
      const hrefs = getNavEntries(context).map((entry) => entry.href);
      for (const moduleDef of registry) {
        const allowed = canAccessModule(moduleDef, context);
        for (const item of moduleDef.nav) {
          expect(
            hrefs.includes(item.href),
            `${moduleDef.key} ${item.href}`,
          ).toBe(allowed);
        }
      }
    },
  );
});
