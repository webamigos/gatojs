import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules.generated", () => ({
  modules: [
    { key: "a", apiScopes: [{ key: "organization:read" }] },
    { key: "b" },
    {
      key: "c",
      apiScopes: [{ key: "audit:read" }, { key: "organization:read" }],
    },
  ],
}));

import { knownApiScopes } from "../api-scopes";

describe("knownApiScopes", () => {
  it("pomija moduły bez apiScopes i zwraca zakresy pozostałych bez duplikatów", () => {
    expect(knownApiScopes()).toEqual(["organization:read", "audit:read"]);
  });
});
