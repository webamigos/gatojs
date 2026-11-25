// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));

import { handleCommandError } from "@/shared/utils/error-handling";
import { ModuleDisabledError } from "@/shared/lib/modules/module-disabled-error";

const GENERIC_FAILURE = { success: false, error: "Nie udało się" };

function errorWithDigest(digest: unknown): Error {
  return Object.assign(new Error("next"), { digest });
}

beforeEach(() => {
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
});

describe("handleCommandError with a ModuleDisabledError", () => {
  it("logs a warning with the default message and the same error instance", () => {
    const error = new ModuleDisabledError("uploads");

    handleCommandError(error, "Nie udało się");

    expect(mockLogger.warn).toHaveBeenCalledWith("Nie udało się", {
      err: error,
    });
  });
});

describe("handleCommandError with Next.js control-flow errors", () => {
  it("rethrows a redirect error unchanged", () => {
    const redirect = errorWithDigest("NEXT_REDIRECT;replace;/pl/login;307;");

    expect(() => handleCommandError(redirect, "Nie udało się")).toThrow(
      redirect,
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("returns the generic failure for a not-found fallback digest", () => {
    expect(
      handleCommandError(
        errorWithDigest("NEXT_HTTP_ERROR_FALLBACK;404"),
        "Nie udało się",
      ),
    ).toEqual(GENERIC_FAILURE);
  });

  it("returns the generic failure for a non-string digest", () => {
    expect(handleCommandError(errorWithDigest(5), "Nie udało się")).toEqual(
      GENERIC_FAILURE,
    );
  });

  it("returns the generic failure for a digest that only ends with NEXT_REDIRECT", () => {
    expect(
      handleCommandError(errorWithDigest("x;NEXT_REDIRECT"), "Nie udało się"),
    ).toEqual(GENERIC_FAILURE);
  });

  it("returns the generic failure for null without throwing", () => {
    expect(handleCommandError(null, "m")).toEqual({
      success: false,
      error: "m",
    });
  });

  it("returns the generic failure for an object without a digest", () => {
    expect(handleCommandError({ code: "E" }, "Nie udało się")).toEqual(
      GENERIC_FAILURE,
    );
  });

  it("returns the generic failure for a string error", () => {
    expect(handleCommandError("NEXT_REDIRECT", "Nie udało się")).toEqual(
      GENERIC_FAILURE,
    );
  });
});
