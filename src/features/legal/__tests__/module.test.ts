import { describe, expect, it } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import legalModuleDefinition from "../module";

const legalModule: ModuleDef = legalModuleDefinition;

describe("legal module definition", () => {
  it("is the public legal module owning /terms and /privacy", () => {
    expect(legalModule.key).toBe("legal");
    expect(legalModule.public).toBe(true);
    expect(legalModule.routePrefixes).toEqual(["/terms", "/privacy"]);
  });

  it("is not restricted to roles or admins", () => {
    expect(legalModule.roles).toBeUndefined();
    expect(legalModule.adminOnly).toBeUndefined();
  });

  it("adds no navigation entries: the links come through slots", () => {
    expect(legalModule.nav).toEqual([]);
  });
});
