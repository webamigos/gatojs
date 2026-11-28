import { describe, expect, it } from "vitest";
import { slotDefinitions } from "../slots";

describe("auth slots", () => {
  it("declares auth.footer as a server slot", () => {
    expect(slotDefinitions).toEqual([{ id: "auth.footer", kind: "server" }]);
  });
});
