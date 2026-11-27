// @vitest-environment node
import { describe, expect, it } from "vitest";
import { moduleSlots } from "@/modules.generated";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import type { OrgRole } from "@/shared/lib/auth/roles";
import { visibleContributions } from "@/shared/lib/modules/slot-access";
import { roleAllows, type SlotContribution } from "@/shared/lib/modules/slots";
import { slots } from "../slots";

const CARD_ID = "invoices.unpaid-card";

function viewer(orgRole: OrgRole): AccessContext {
  return { userRole: "user", orgRole, multiOrg: false };
}

function unpaidCard(): SlotContribution {
  const contributions: readonly SlotContribution[] = slots;
  const card = contributions.find(
    (contribution) => contribution.id === CARD_ID,
  );
  if (card === undefined) {
    throw new Error(`contribution not found: ${CARD_ID}`);
  }
  return card;
}

function visibleDashboardIds(orgRole: OrgRole): string[] {
  return visibleContributions(
    moduleSlots,
    "dashboard.sections",
    viewer(orgRole),
  ).map((contribution) => contribution.id);
}

describe("invoices dashboard contribution", () => {
  it("contributes invoices.unpaid-card to dashboard.sections with priority 20 for owner and admin", () => {
    expect(unpaidCard()).toMatchObject({
      slot: "dashboard.sections",
      id: CARD_ID,
      priority: 20,
      roles: ["owner", "admin"],
    });
  });

  it("lazy-loads the card component", () => {
    expect(unpaidCard().component).toBeTypeOf("function");
  });

  it("the card is allowed for an owner", () => {
    expect(roleAllows(unpaidCard(), viewer("owner"))).toBe(true);
  });

  it("the card is allowed for an admin", () => {
    expect(roleAllows(unpaidCard(), viewer("admin"))).toBe(true);
  });

  it("the card is not allowed for a member", () => {
    expect(roleAllows(unpaidCard(), viewer("member"))).toBe(false);
  });

  it("the generated registry places the card on the dashboard of an owner", () => {
    expect(visibleDashboardIds("owner")).toContain(CARD_ID);
  });

  it("the generated registry places the card on the dashboard of an admin", () => {
    expect(visibleDashboardIds("admin")).toContain(CARD_ID);
  });

  it("the generated registry hides the card from the dashboard of a member", () => {
    expect(visibleDashboardIds("member")).not.toContain(CARD_ID);
  });

  it("the generated registry registers the card under the invoices module with priority 20", () => {
    expect(
      moduleSlots.filter((contribution) => contribution.id === CARD_ID),
    ).toEqual([
      expect.objectContaining({
        module: "invoices",
        kind: "server",
        slot: "dashboard.sections",
        priority: 20,
      }),
    ]);
  });
});
