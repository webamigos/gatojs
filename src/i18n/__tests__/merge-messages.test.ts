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
});
