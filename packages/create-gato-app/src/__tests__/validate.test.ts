import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { adminEmailError, envValueError, titleError } from "../validate.js";

const TITLE_MESSAGE =
  "Title: use 1-60 characters without quotes, backslashes, <, >, $, backticks or control characters";
const EMAIL_MESSAGE = "Admin email: expected an address like admin@example.com";
const ENV_VALUE_MESSAGE = "S3 secret: no spaces, quotes, backslashes, #, $ or backticks";

const DOMAIN_252 = `${"b".repeat(61)}.${"b".repeat(61)}.${"b".repeat(61)}.${"c".repeat(62)}.com`;

describe("titleError", () => {
  it.each(["Acme Shop", "Zażółć & Co's", "x", "x".repeat(60)])("%j jest poprawnym tytułem", (title) => {
    expect(titleError(title)).toBeNull();
  });

  it.each(["", "   ", "x".repeat(61)])("%j dostaje komunikat błędu", (title) => {
    expect(titleError(title)).toEqual(expect.any(String));
  });

  it.each(['A"B', "A\\B", "A<B", "A>B", "A$B", "A`B", "A\nB", "A\tB", "A\u007fB", "A\u0000B", "A\rB"])(
    "%j z zakazanym znakiem dostaje komunikat o dozwolonych znakach",
    (title) => {
      expect(titleError(title)).toBe(TITLE_MESSAGE);
    },
  );

  test.prop([fc.stringMatching(/^[A-Za-z0-9]([A-Za-z0-9 &',.()-]{0,58}[A-Za-z0-9])?$/)])(
    "każdy tytuł 1-60 znaków z liter, cyfr i bezpiecznej interpunkcji jest poprawny",
    (title) => {
      expect(titleError(title)).toBeNull();
    },
  );

  test.prop([
    fc.stringMatching(/^[A-Za-z0-9 ]{0,29}$/),
    fc.constantFrom('"', "\\", "<", ">", "$", "`", "\n", "\t", "\u0000", "\u001f", "\u007f"),
    fc.stringMatching(/^[A-Za-z0-9 ]{0,29}$/),
  ])("tytuł z dowolnym zakazanym znakiem w dowolnym miejscu jest odrzucony", (before, forbidden, after) => {
    expect(titleError(`A${before}${forbidden}${after}`)).toBe(TITLE_MESSAGE);
  });
});

describe("adminEmailError", () => {
  it.each(["admin@example.com", "first.last+tag@sub.example.co", `a@${DOMAIN_252}`])(
    "%j jest poprawnym adresem",
    (email) => {
      expect(adminEmailError(email)).toBeNull();
    },
  );

  it("adres o długości 254 znaków jest poprawny, a 255 już nie", () => {
    expect(`a@${DOMAIN_252}`).toHaveLength(254);
    expect(`aa@${DOMAIN_252}`).toHaveLength(255);
    expect(adminEmailError(`a@${DOMAIN_252}`)).toBeNull();
    expect(adminEmailError(`aa@${DOMAIN_252}`)).toBe(EMAIL_MESSAGE);
  });

  it.each(["", "admin", "a@b", "a b@example.com", "a@-x.com", "a'b@example.com", "a@b.", "@example.com", "a@@example.com", 'a"b@example.com', "a@exa mple.com"])(
    "%j jest odrzucony z komunikatem o oczekiwanym adresie",
    (email) => {
      expect(adminEmailError(email)).toBe(EMAIL_MESSAGE);
    },
  );
});

describe("envValueError", () => {
  it.each(["abc/DEF+123=", "AKIAIOSFODNN7EXAMPLE", "minioadmin", "a-b_c.d:e"])("%j jest poprawną wartością", (value) => {
    expect(envValueError("S3 secret", value)).toBeNull();
  });

  it("pusta wartość jest wymagana", () => {
    expect(envValueError("S3 secret", "")).toBe("S3 secret: required");
  });

  it("etykieta trafia na początek komunikatu", () => {
    expect(envValueError("S3 access key id", "")).toBe("S3 access key id: required");
  });

  it.each(["a b", 'a"b', "a'b", "a\\b", "a#b", "a$b", "a`b", "a\tb", "a\nb", " ab", "ab "])(
    "%j ze znakiem niebezpiecznym w .env jest odrzucona",
    (value) => {
      expect(envValueError("S3 secret", value)).toBe(ENV_VALUE_MESSAGE);
    },
  );
});
