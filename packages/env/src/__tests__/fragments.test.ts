import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { blankAsUndefined, flag, httpUrl } from "../index";

const whitespaceOnly = fc.string({
  unit: fc.constantFrom(" ", "\t", "\n", "\r", "\v", "\f"),
  maxLength: 12,
});

const withVisibleCharacter = fc
  .tuple(
    fc.string(),
    fc.string({ minLength: 1 }).filter((s) => /\S/.test(s)),
    fc.string(),
  )
  .map(([before, visible, after]) => `${before}${visible}${after}`);

describe("httpUrl", () => {
  it.each([
    "http://localhost:4318",
    "https://x.example.com",
    "https://app.example.com/path?q=1",
  ])("%j is accepted unchanged", (value) => {
    expect(httpUrl().safeParse(value)).toEqual({ success: true, data: value });
  });

  it.each([
    "localhost:4318",
    "x.example.com",
    "ftp://x",
    "ws://localhost:4318",
    "file:///etc/passwd",
    "git+https://example.com",
    "httpx://example.com",
    "http//x",
    "/relative",
    "",
  ])("%j is rejected with zod's default URL message", (value) => {
    const result = httpUrl().safeParse(value);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([
      { path: [], message: "Invalid URL" },
    ]);
  });

  test.prop([
    fc.constantFrom(
      "ftp",
      "ws",
      "wss",
      "file",
      "mailto",
      "s3",
      "grpc",
      "redis",
    ),
    fc.domain(),
  ])(
    "a URL with a scheme other than http or https is rejected",
    (scheme, host) => {
      expect(httpUrl().safeParse(`${scheme}://${host}`).success).toBe(false);
    },
  );

  test.prop([fc.constantFrom("http", "https"), fc.domain()])(
    "an http or https URL with a domain is accepted",
    (scheme, host) => {
      expect(httpUrl().safeParse(`${scheme}://${host}`).success).toBe(true);
    },
  );

  it("each call returns a fresh schema", () => {
    expect(httpUrl()).not.toBe(httpUrl());
  });

  it("a non-string value is rejected", () => {
    expect(httpUrl().safeParse(4318).success).toBe(false);
  });
});

describe("blankAsUndefined", () => {
  it.each(["", "   ", "\t\n", " \r\n\t "])(
    "%j becomes undefined before the schema runs",
    (value) => {
      expect(
        blankAsUndefined(z.string().optional()).parse(value),
      ).toBeUndefined();
    },
  );

  it.each(["a", " a ", "\ta\n", "0", "false"])(
    "%j reaches the schema unchanged, without trimming",
    (value) => {
      expect(blankAsUndefined(z.string().optional()).parse(value)).toBe(value);
    },
  );

  it("a missing value stays undefined", () => {
    expect(
      blankAsUndefined(z.string().optional()).parse(undefined),
    ).toBeUndefined();
  });

  it("a blank value reaches a required schema as undefined and fails there", () => {
    expect(blankAsUndefined(z.string()).safeParse("   ").success).toBe(false);
  });

  it("a non-blank value is still validated by the wrapped schema", () => {
    expect(
      blankAsUndefined(z.string().min(5).optional()).safeParse("abc").success,
    ).toBe(false);
    expect(blankAsUndefined(z.string().min(5).optional()).parse("abcde")).toBe(
      "abcde",
    );
  });

  it("a blank value lets the wrapped schema apply its default", () => {
    expect(blankAsUndefined(z.string().default("info")).parse("  ")).toBe(
      "info",
    );
  });

  it("a non-string value passes to the wrapped schema unchanged", () => {
    expect(blankAsUndefined(z.number().optional()).parse(3)).toBe(3);
    expect(blankAsUndefined(z.string().optional()).safeParse(3).success).toBe(
      false,
    );
  });

  it("works on an http URL: blank → undefined, scheme-less → failure", () => {
    const endpoint = blankAsUndefined(httpUrl().optional());

    expect(endpoint.parse("   ")).toBeUndefined();
    expect(endpoint.parse("http://localhost:4318")).toBe(
      "http://localhost:4318",
    );
    expect(endpoint.safeParse("localhost:4318").success).toBe(false);
  });

  it("each call returns a fresh schema", () => {
    const inner = z.string().optional();

    expect(blankAsUndefined(inner)).not.toBe(blankAsUndefined(inner));
  });

  test.prop([whitespaceOnly])(
    "any whitespace-only string becomes undefined",
    (value) => {
      expect(
        blankAsUndefined(z.string().optional()).parse(value),
      ).toBeUndefined();
    },
  );

  test.prop([withVisibleCharacter])(
    "any string with a non-whitespace character passes through unchanged",
    (value) => {
      expect(blankAsUndefined(z.string().optional()).parse(value)).toBe(value);
    },
  );
});

describe("flag", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["   ", false],
    ["true", true],
    ["TRUE", true],
    [" True ", true],
    ["false", false],
    ["FALSE", false],
    [" false", false],
  ] as const)("%j → %s", (value, expected) => {
    expect(flag().parse(value)).toBe(expected);
  });

  it.each(["1", "0", "yes", "no", "on", "tru", "truee"])(
    "%j is rejected",
    (value) => {
      expect(flag().safeParse(value).success).toBe(false);
    },
  );

  it("a missing key in an object reads as false", () => {
    expect(z.object({ FEATURE: flag() }).parse({})).toEqual({ FEATURE: false });
  });

  it("an invalid value in an object is reported on that key", () => {
    const result = z.object({ FEATURE: flag() }).safeParse({ FEATURE: "yes" });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ path: ["FEATURE"] }]);
  });

  it("each call returns a fresh schema", () => {
    expect(flag()).not.toBe(flag());
  });
});
