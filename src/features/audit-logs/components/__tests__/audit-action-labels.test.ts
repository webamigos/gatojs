import { describe, expect, it } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import { findAuditActionLabel } from "../audit-action-labels";

const warehouse: ModuleDef = {
  key: "warehouse",
  nav: [],
  routePrefixes: [],
  auditActions: [
    { action: "delivery.received", labelKey: "auditActions.deliveryReceived" },
  ],
};
const billing: ModuleDef = {
  key: "billing",
  nav: [],
  routePrefixes: [],
  auditActions: [{ action: "invoice.paid", labelKey: "paid" }],
};
const plain: ModuleDef = { key: "plain", nav: [], routePrefixes: [] };

describe("findAuditActionLabel", () => {
  it("zwraca namespace modułu deklarującego akcję", () => {
    expect(
      findAuditActionLabel("delivery.received", [plain, warehouse]),
    ).toEqual({
      namespace: "warehouse",
      labelKey: "auditActions.deliveryReceived",
    });
  });

  it("rozróżnia moduły deklarujące różne akcje", () => {
    expect(findAuditActionLabel("invoice.paid", [warehouse, billing])).toEqual({
      namespace: "billing",
      labelKey: "paid",
    });
  });

  it("zwraca null dla niezadeklarowanej akcji", () => {
    expect(
      findAuditActionLabel("invoice.voided", [warehouse, billing]),
    ).toBeNull();
  });

  it("zwraca null dla pustej listy modułów", () => {
    expect(findAuditActionLabel("delivery.received", [])).toBeNull();
  });
});
