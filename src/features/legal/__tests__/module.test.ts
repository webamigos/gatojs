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

  it("adds the privacy and terms links to the navigation", () => {
    expect(legalModule.nav).toEqual([
      {
        id: "legal.privacy",
        href: "/privacy",
        labelKey: "nav-privacy",
        icon: "shield",
        order: 900,
      },
      {
        id: "legal.terms",
        href: "/terms",
        labelKey: "nav-terms",
        icon: "file-text",
        order: 910,
      },
    ]);
  });
});
