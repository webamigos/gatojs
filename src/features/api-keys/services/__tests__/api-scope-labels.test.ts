import { describe, expect, it } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import { findApiScopeLabel } from "../api-scope-labels";

const warehouse: ModuleDef = {
  key: "warehouse",
  nav: [],
  routePrefixes: [],
  apiScopes: [
    { key: "stock:read", labelKey: "scopes.stockRead" },
    { key: "stock:write", labelKey: "scopes.stockWrite" },
  ],
};
const billing: ModuleDef = {
  key: "billing",
  nav: [],
  routePrefixes: [],
  apiScopes: [{ key: "invoice:read", labelKey: "invoiceRead" }],
};
const plain: ModuleDef = { key: "plain", nav: [], routePrefixes: [] };

describe("findApiScopeLabel", () => {
  it("wybiera drugi scope modułu, nie pierwszy", () => {
    expect(findApiScopeLabel("stock:write", [warehouse])).toEqual({
      namespace: "warehouse",
      labelKey: "scopes.stockWrite",
    });
  });

  it("wybiera pierwszy scope modułu", () => {
    expect(findApiScopeLabel("stock:read", [warehouse])).toEqual({
      namespace: "warehouse",
      labelKey: "scopes.stockRead",
    });
  });

  it("zwraca namespace modułu deklarującego scope, pomijając moduły bez scope'ów", () => {
    expect(
      findApiScopeLabel("invoice:read", [plain, warehouse, billing]),
    ).toEqual({ namespace: "billing", labelKey: "invoiceRead" });
  });

  it("nieznany scope daje null", () => {
    expect(
      findApiScopeLabel("nope:read", [plain, warehouse, billing]),
    ).toBeNull();
  });

  it("brak modułów daje null", () => {
    expect(findApiScopeLabel("stock:read", [])).toBeNull();
  });
});
