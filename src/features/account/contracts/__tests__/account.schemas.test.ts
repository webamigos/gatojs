import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { accountNameSchema } from "../account.schemas";

const whitespace = fc.string({
  unit: fc.constantFrom(" ", "\t", "\n", "\r", " ", "　"),
  maxLength: 20,
});

const visibleName = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((value) => value.trim().length > 0);

describe("accountNameSchema", () => {
  it("obcina spacje z obu stron imienia i nazwiska", () => {
    expect(accountNameSchema.parse({ name: "  Jan Kowalski  " })).toEqual({
      name: "Jan Kowalski",
    });
  });

  it("pomija klucze spoza schematu", () => {
    expect(
      accountNameSchema.parse({ name: "Jan", email: "x@y.z", role: "admin" }),
    ).toEqual({ name: "Jan" });
  });

  it.each([
    ["pusty napis", { name: "" }],
    ["same spacje", { name: "   " }],
    ["brak pola name", {}],
    ["liczba zamiast napisu", { name: 5 }],
    ["null zamiast obiektu", null],
    ["napis zamiast obiektu", "Jan"],
  ])("odrzuca %s", (_label, input) => {
    expect(accountNameSchema.safeParse(input).success).toBe(false);
  });

  it("przyjmuje jeden znak", () => {
    expect(accountNameSchema.parse({ name: "J" })).toEqual({ name: "J" });
  });

  it("przyjmuje imię i nazwisko o długości 100 znaków", () => {
    const name = "a".repeat(100);
    expect(accountNameSchema.parse({ name })).toEqual({ name });
  });

  it("odrzuca imię i nazwisko o długości 101 znaków", () => {
    expect(accountNameSchema.safeParse({ name: "a".repeat(101) }).success).toBe(
      false,
    );
  });

  it("limit 100 znaków dotyczy wartości po obcięciu spacji", () => {
    const name = "a".repeat(100);
    expect(accountNameSchema.parse({ name: `   ${name}   ` })).toEqual({
      name,
    });
  });

  test.prop([whitespace, visibleName, whitespace])(
    "napis o długości od 1 do 100 po obcięciu wraca w obciętej postaci",
    (left, core, right) => {
      const raw = `${left}${core}${right}`;
      expect(accountNameSchema.parse({ name: raw })).toEqual({
        name: raw.trim(),
      });
    },
  );

  test.prop([whitespace])(
    "napis złożony wyłącznie z białych znaków zawsze jest odrzucany",
    (name) => {
      expect(accountNameSchema.safeParse({ name }).success).toBe(false);
    },
  );

  test.prop([
    fc
      .string({ minLength: 101, maxLength: 300 })
      .filter((value) => value.trim().length > 100),
  ])("napis dłuższy niż 100 znaków po obcięciu jest odrzucany", (name) => {
    expect(accountNameSchema.safeParse({ name }).success).toBe(false);
  });
});
