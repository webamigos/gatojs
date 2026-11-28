import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { isFiveFieldCron } from "@/shared/lib/jobs";

const FIELD_BOUNDS: readonly (readonly [number, number])[] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function itemArbitrary([min, max]: readonly [number, number]) {
  const value = fc.integer({ min, max }).map(String);
  const range = fc
    .tuple(fc.integer({ min, max }), fc.integer({ min, max }))
    .map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`);
  const base = fc.oneof(fc.constant("*"), value, range);
  const step = fc.option(
    fc.integer({ min: 1, max }).map((s) => `/${s}`),
    { nil: "" },
  );
  return fc.tuple(base, step).map(([item, suffix]) => `${item}${suffix}`);
}

function fieldArbitrary(bounds: readonly [number, number]) {
  return fc
    .array(itemArbitrary(bounds), { minLength: 1, maxLength: 3 })
    .map((items) => items.join(","));
}

const validCron = fc
  .tuple(
    fieldArbitrary(FIELD_BOUNDS[0]),
    fieldArbitrary(FIELD_BOUNDS[1]),
    fieldArbitrary(FIELD_BOUNDS[2]),
    fieldArbitrary(FIELD_BOUNDS[3]),
    fieldArbitrary(FIELD_BOUNDS[4]),
  )
  .map((fields) => fields.join(" "));

describe("isFiveFieldCron: przyjmowane wyrażenia", () => {
  it.each([
    "0 3 * * *",
    "* * * * *",
    "0 0 1 1 0",
    "59 23 31 12 7",
    "0,15,30,45 * * * *",
    "0-59 0-23 1-31 1-12 0-7",
    "1-1 * * * *",
    "*/15 * * * *",
    "0-30/5 * * * *",
    "5/15 * * * *",
    "5 4 * * 1-5",
    "0 8 * * 1",
    "*/59 */23 */31 */12 */7",
    "*/1 * * * *",
    "  0 3 * * *  ",
    "0\t3 * * *",
    "0  3 * * *",
  ])("przyjmuje %j", (expression) => {
    expect(isFiveFieldCron(expression)).toBe(true);
  });
});

describe("isFiveFieldCron: granice pól", () => {
  it.each([
    ["minuta 59", "59 * * * *", true],
    ["minuta 60", "60 * * * *", false],
    ["godzina 23", "* 23 * * *", true],
    ["godzina 24", "* 24 * * *", false],
    ["dzień 0", "* * 0 * *", false],
    ["dzień 1", "* * 1 * *", true],
    ["dzień 31", "* * 31 * *", true],
    ["dzień 32", "* * 32 * *", false],
    ["miesiąc 0", "* * * 0 *", false],
    ["miesiąc 12", "* * * 12 *", true],
    ["miesiąc 13", "* * * 13 *", false],
    ["dzień tygodnia 7", "* * * * 7", true],
    ["dzień tygodnia 8", "* * * * 8", false],
    ["zakres minut do 60", "0-60 * * * *", false],
    ["krok minut 60", "*/60 * * * *", false],
    ["krok godzin 24", "* */24 * * *", false],
    ["krok dni 32", "* * */32 * *", false],
    ["krok miesięcy 13", "* * * */13 *", false],
    ["krok dni tygodnia 8", "* * * * */8", false],
  ])("%s: %j → %s", (_label, expression, expected) => {
    expect(isFiveFieldCron(expression)).toBe(expected);
  });
});

describe("isFiveFieldCron: odrzucane wyrażenia", () => {
  it.each([
    "30-10 * * * *",
    "*/0 * * * *",
    "* * * * MON",
    "* * * JAN *",
    "* * ? * *",
    "* * L * *",
    "* * 15W * *",
    "* * * * 1#2",
    "1,,2 * * * *",
    ",1 * * * *",
    "1, * * * *",
    "-1 * * * *",
    "+1 * * * *",
    "1.5 * * * *",
    "*/ * * * *",
    "1- * * * *",
    "1/2/3 * * * *",
    "a * * * *",
    "* * * *",
    "* * * * * *",
    "0 0 3 * * *",
    "",
    "   ",
  ])("odrzuca %j", (expression) => {
    expect(isFiveFieldCron(expression)).toBe(false);
  });
});

describe("isFiveFieldCron: własności", () => {
  test.prop([validCron])(
    "każde wyrażenie zbudowane w granicach pól jest przyjęte",
    (expression) => {
      expect(isFiveFieldCron(expression)).toBe(true);
    },
  );

  test.prop([
    validCron,
    fc.integer({ min: 0, max: 4 }),
    fc.integer({ min: 1, max: 100 }),
  ])(
    "wartość powyżej maksimum pola jest odrzucona",
    (expression, index, excess) => {
      const fields = expression.split(" ");
      fields[index] = String(FIELD_BOUNDS[index][1] + excess);
      expect(isFiveFieldCron(fields.join(" "))).toBe(false);
    },
  );

  test.prop([
    validCron,
    fc.integer({ min: 2, max: 3 }),
    fc.integer({ min: 1, max: 5 }),
  ])(
    "wartość poniżej minimum dnia lub miesiąca jest odrzucona",
    (expression, index, deficit) => {
      const fields = expression.split(" ");
      fields[index] = String(FIELD_BOUNDS[index][0] - deficit);
      expect(isFiveFieldCron(fields.join(" "))).toBe(false);
    },
  );

  test.prop([validCron, fc.constantFrom("*", "0", "1-2")])(
    "szóste pole po poprawnym wyrażeniu daje odrzucenie",
    (expression, extra) => {
      expect(isFiveFieldCron(`${expression} ${extra}`)).toBe(false);
    },
  );
});
