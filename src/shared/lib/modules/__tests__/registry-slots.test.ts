import { describe, expect, it } from "vitest";
import { clientModuleSlots } from "@/modules.client.generated";
import { moduleSlots } from "@/modules.generated";

describe("the generated registries and the slots", () => {
  it("the server registry exports moduleSlots as a list", () => {
    expect(Array.isArray(moduleSlots)).toBe(true);
  });

  it("the client registry exports clientModuleSlots as a list", () => {
    expect(Array.isArray(clientModuleSlots)).toBe(true);
  });
});
