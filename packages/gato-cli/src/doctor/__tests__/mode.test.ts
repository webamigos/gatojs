import { describe, expect, it } from "vitest";
import { FILE_PROTECTION_MODE } from "../mode.js";

describe("FILE_PROTECTION_MODE", () => {
  it("is block after the warning period", () => {
    expect(FILE_PROTECTION_MODE).toBe("block");
  });
});
