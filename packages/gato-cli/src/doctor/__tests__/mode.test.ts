import { describe, expect, it } from "vitest";
import { FILE_PROTECTION_MODE } from "../mode.js";

describe("FILE_PROTECTION_MODE", () => {
  it("is warn during the warning period", () => {
    expect(FILE_PROTECTION_MODE).toBe("warn");
  });
});
