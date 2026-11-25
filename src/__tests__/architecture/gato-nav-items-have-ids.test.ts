import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientModules } from "@/modules.client.generated";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import { CORE_MODULE_KEYS } from "@/test/core-modules";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const kitModulesDir = path.join(repoRoot, "kit/modules");
const hasKitModules = fs.existsSync(kitModulesDir);

const registry: readonly ModuleDef[] = clientModules;

function isGatoModule(key: string): boolean {
  return (
    (CORE_MODULE_KEYS as readonly string[]).includes(key) ||
    fs.existsSync(path.join(kitModulesDir, `${key}.json`))
  );
}

const gatoModules = registry.filter((moduleDef) => isGatoModule(moduleDef.key));

function navIdsOf(key: string): (string | undefined)[] | undefined {
  return registry
    .find((moduleDef) => moduleDef.key === key)
    ?.nav.map((item) => item.id);
}

function hasModule(key: string): boolean {
  return registry.some((moduleDef) => moduleDef.key === key);
}

describe.skipIf(!hasKitModules)("Gato module nav items have ids", () => {
  it("every nav item of a Gato module has an id prefixed with its module key", () => {
    const missing = gatoModules.flatMap((moduleDef) =>
      moduleDef.nav
        .filter((item) => !item.id?.startsWith(`${moduleDef.key}.`))
        .map(
          (item) => `${moduleDef.key}: ${item.href} (${item.id ?? "no id"})`,
        ),
    );
    expect(missing).toEqual([]);
  });

  it("nav ids are unique across the registry", () => {
    const ids = registry.flatMap((moduleDef) =>
      moduleDef.nav.flatMap((item) => (item.id === undefined ? [] : [item.id])),
    );
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it("the Gato modules with nav items are found in the registry", () => {
    expect(
      gatoModules.filter((moduleDef) => moduleDef.nav.length > 0).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("dashboard has the nav id dashboard.home", () => {
    expect(navIdsOf("dashboard")).toEqual(["dashboard.home"]);
  });

  it("users has the nav id users.list", () => {
    expect(navIdsOf("users")).toEqual(["users.list"]);
  });

  it("account has the nav id account.home", () => {
    expect(navIdsOf("account")).toEqual(["account.home"]);
  });

  it.skipIf(!hasModule("api-keys"))(
    "api-keys has the nav id api-keys.list",
    () => {
      expect(navIdsOf("api-keys")).toEqual(["api-keys.list"]);
    },
  );

  it.skipIf(!hasModule("audit-logs"))(
    "audit-logs has the nav id audit-logs.list",
    () => {
      expect(navIdsOf("audit-logs")).toEqual(["audit-logs.list"]);
    },
  );
});
