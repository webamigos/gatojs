import { describe, expect, it } from "vitest";
import { readSignupMembership } from "../signup-membership-context";

describe("readSignupMembership", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["napis", "x"],
    ["liczba", 42],
  ])(
    "kontekst nie będący obiektem (%s) → null bez wyjątku",
    (_label, context) => {
      expect(() => readSignupMembership(context)).not.toThrow();
      expect(readSignupMembership(context)).toBeNull();
    },
  );

  it.each([
    ["pusty obiekt", {}],
    ["signupMembership: null", { signupMembership: null }],
    ["signupMembership jako napis", { signupMembership: "join" }],
    ["signupMembership bez akcji", { signupMembership: {} }],
  ])("kontekst bez poprawnego członkostwa (%s) → null", (_label, context) => {
    expect(readSignupMembership(context)).toBeNull();
  });

  it("nieznana akcja członkostwa → null", () => {
    expect(
      readSignupMembership({ signupMembership: { action: "delete" } }),
    ).toBeNull();
  });

  it("akcja join → zwraca to samo członkostwo", () => {
    const membership = {
      action: "join",
      organizationId: "o1",
      role: "member",
    } as const;

    expect(readSignupMembership({ signupMembership: membership })).toBe(
      membership,
    );
  });

  it("akcja create → zwraca to samo członkostwo", () => {
    const membership = {
      action: "create",
      organizationName: "X",
      role: "owner",
    } as const;

    expect(readSignupMembership({ signupMembership: membership })).toBe(
      membership,
    );
  });
});
