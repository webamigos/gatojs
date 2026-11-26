import { describe, expect, it } from "vitest";
import { clientComponentOverrides } from "@/modules.client.generated";

describe("the generated client registry and component overrides", () => {
  it("the client registry exports clientComponentOverrides as a Map", () => {
    expect(clientComponentOverrides).toBeInstanceOf(Map);
  });
});
