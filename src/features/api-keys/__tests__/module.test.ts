import { describe, expect, it } from "vitest";
import apiKeysModule from "../module";

describe("api-keys module", () => {
  it("declares the create, revoke and delete commands", () => {
    expect(apiKeysModule.commands).toEqual([
      "api-keys.create",
      "api-keys.revoke",
      "api-keys.delete",
    ]);
  });
});
