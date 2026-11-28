import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { consentCookieSchema } from "../consent.schemas";

function choiceKeys(data: unknown): string[] {
  const choices = (data as { c?: object } | undefined)?.c;
  return choices === undefined ? ["<no choices>"] : Object.keys(choices);
}

describe("consentCookieSchema", () => {
  it("accepts a valid payload unchanged", () => {
    const result = consentCookieSchema.safeParse({
      v: 1,
      c: { analytics: true },
      t: 1700000000,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      v: 1,
      c: { analytics: true },
      t: 1700000000,
    });
  });

  it("drops unknown category keys and leaves absent categories absent", () => {
    const result = consentCookieSchema.safeParse({
      v: 2,
      c: { analytics: false, other: true, marketing: true },
      t: 5,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      v: 2,
      c: { analytics: false, marketing: true },
      t: 5,
    });
    expect(choiceKeys(result.data)).toEqual(["analytics", "marketing"]);
  });

  it("accepts empty choices and a decision time of zero", () => {
    const result = consentCookieSchema.safeParse({ v: 1, c: {}, t: 0 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ v: 1, c: {}, t: 0 });
    expect(choiceKeys(result.data)).toEqual([]);
  });

  it.each([
    ["version 0", { v: 0, c: {}, t: 1 }],
    ["a negative version", { v: -1, c: {}, t: 1 }],
    ["a fractional version", { v: 1.5, c: {}, t: 1 }],
    ["a version given as text", { v: "1", c: {}, t: 1 }],
    ["a missing version", { c: {}, t: 1 }],
    ["a negative decision time", { v: 1, c: {}, t: -1 }],
    ["a fractional decision time", { v: 1, c: {}, t: 1.5 }],
    ["a decision time given as text", { v: 1, c: {}, t: "x" }],
    ["a missing decision time", { v: 1, c: {} }],
    ["choices as an array", { v: 1, c: [], t: 1 }],
    ["choices as null", { v: 1, c: null, t: 1 }],
    ["missing choices", { v: 1, t: 1 }],
    ["a choice given as text", { v: 1, c: { analytics: "yes" }, t: 1 }],
    ["a choice given as a number", { v: 1, c: { preferences: 1 }, t: 1 }],
  ])("rejects a payload with %s", (_label, payload) => {
    expect(consentCookieSchema.safeParse(payload).success).toBe(false);
  });

  it.each([
    ["an array", [1]],
    ["null", null],
    ["a number", 5],
    ["a string", "s"],
  ])("rejects %s at the top level", (_label, payload) => {
    expect(consentCookieSchema.safeParse(payload).success).toBe(false);
  });

  test.prop([
    fc.record({
      v: fc.integer({ min: 1, max: 1_000_000 }),
      c: fc.record(
        {
          preferences: fc.boolean(),
          analytics: fc.boolean(),
          marketing: fc.boolean(),
        },
        { requiredKeys: [] },
      ),
      t: fc.integer({ min: 0, max: 4_000_000_000 }),
    }),
  ])("accepts every well-formed payload unchanged", (payload) => {
    const result = consentCookieSchema.safeParse(payload);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(payload);
    expect(choiceKeys(result.data).sort()).toEqual(
      Object.keys(payload.c).sort(),
    );
  });
});
