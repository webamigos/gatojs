import { describe, expect, it } from "vitest";
import { moduleSlots } from "@/modules.generated";

describe("legal contributions in the generated slot registry", () => {
  it("registers the banner in app.root and the links in auth.footer and app.sidebar.footer as server contributions", () => {
    expect(
      moduleSlots
        .filter((contribution) => contribution.module === "legal")
        .map(({ slot, id, kind }) => ({ slot, id, kind })),
    ).toEqual([
      { slot: "app.root", id: "legal.cookie-banner", kind: "server" },
      { slot: "auth.footer", id: "legal.auth-footer-links", kind: "server" },
      {
        slot: "app.sidebar.footer",
        id: "legal.sidebar-footer-links",
        kind: "server",
      },
    ]);
  });
});
