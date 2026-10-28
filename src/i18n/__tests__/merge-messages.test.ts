import { describe, expect, it } from "vitest";
import { mergeMessages } from "../merge-messages";

describe("mergeMessages", () => {
  it("places each module under its own key", () => {
    expect(
      mergeMessages({ common: {} }, [{ key: "auth", messages: { a: 1 } }]),
    ).toEqual({ common: {}, auth: { a: 1 } });
  });

  it("throws on collision with a core key", () => {
    expect(() =>
      mergeMessages({ common: {} }, [{ key: "common", messages: {} }]),
    ).toThrow("Kolizja namespace i18n: common");
  });

  it("throws on collision between modules", () => {
    expect(() =>
      mergeMessages({}, [
        { key: "auth", messages: {} },
        { key: "auth", messages: {} },
      ]),
    ).toThrow("Kolizja namespace i18n: auth");
  });

  it("klucze z prototypu Object nieobecne w core trafiają do wyniku jako własne", () => {
    const merged = mergeMessages({ common: {} }, [
      { key: "constructor", messages: { a: 1 } },
      { key: "toString", messages: { b: 2 } },
      { key: "hasOwnProperty", messages: { c: 3 } },
    ]);
    expect(Object.hasOwn(merged, "constructor")).toBe(true);
    expect(Object.hasOwn(merged, "toString")).toBe(true);
    expect(Object.hasOwn(merged, "hasOwnProperty")).toBe(true);
    expect(merged).toEqual({
      common: {},
      constructor: { a: 1 },
      toString: { b: 2 },
      hasOwnProperty: { c: 3 },
    });
  });

  it.each(["__proto__", "", "Auth", "a b", "1x"])(
    "klucz %j → błąd nieprawidłowego klucza",
    (key) => {
      expect(() =>
        mergeMessages({ common: {} }, [{ key, messages: { a: 1 } }]),
      ).toThrow(`Nieprawidłowy klucz namespace i18n: ${key}`);
    },
  );

  it("klucze z myślnikiem i cyframi są prawidłowe", () => {
    expect(
      mergeMessages({}, [{ key: "file-storage2", messages: { a: 1 } }]),
    ).toEqual({ "file-storage2": { a: 1 } });
  });

  it("wynik ma prototyp Object.prototype", () => {
    const merged = mergeMessages({ common: {} }, [
      { key: "auth", messages: { a: 1 } },
      { key: "constructor", messages: { b: 2 } },
    ]);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
  });
});
