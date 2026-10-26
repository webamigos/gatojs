import { describe, expect, it } from "vitest";
import { assertSignupAllowed } from "../signup-policy";

describe("assertSignupAllowed", () => {
  it("odrzuca rejestrację bez zaproszenia gdy publiczna wyłączona", () => {
    expect(() =>
      assertSignupAllowed({ publicSignup: false, hasInvitation: false }),
    ).toThrow("Rejestracja jest wyłączona");
  });

  it.each([
    [true, false],
    [false, true],
    [true, true],
  ])("pozwala (%s,%s)", (publicSignup, hasInvitation) => {
    expect(() =>
      assertSignupAllowed({ publicSignup, hasInvitation }),
    ).not.toThrow();
  });
});
