// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));

import { handleCommandError } from "@/shared/utils/error-handling";
import { ModuleDisabledError } from "@/shared/lib/modules/module-disabled-error";

beforeEach(() => {
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
});

describe("handleCommandError with ModuleDisabledError", () => {
  it("returns the default message, not the error's own message", () => {
    const result = handleCommandError(
      new ModuleDisabledError("uploads"),
      "Nie udało się",
    );

    expect(result).toEqual({ success: false, error: "Nie udało się" });
  });

  it("logs once as a warning and never as an error", () => {
    handleCommandError(new ModuleDisabledError("uploads"), "Nie udało się");

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("an unrelated error is still logged as an error", () => {
    const result = handleCommandError(new Error("boom"), "Nie udało się");

    expect(result).toEqual({ success: false, error: "Nie udało się" });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
