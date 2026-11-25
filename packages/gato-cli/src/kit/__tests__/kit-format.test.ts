import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertSupportedKitFormat,
  SUPPORTED_KIT_FORMATS,
} from "../kit-format.js";

describe("SUPPORTED_KIT_FORMATS", () => {
  it("lists formats 1, 2 and 3", () => {
    expect(SUPPORTED_KIT_FORMATS).toEqual([1, 2, 3]);
  });
});

describe("assertSupportedKitFormat", () => {
  it("accepts format 1 of projects created before kitFormat existed", () => {
    expect(() => assertSupportedKitFormat(1)).not.toThrow();
  });

  it("accepts format 2", () => {
    expect(() => assertSupportedKitFormat(2)).not.toThrow();
  });

  it("accepts format 3 with the self-host regions", () => {
    expect(() => assertSupportedKitFormat(3)).not.toThrow();
  });

  it("rejects format 99 with the message naming gato-cli@latest and the npx fallback", () => {
    expect(() => assertSupportedKitFormat(99)).toThrow(
      new Error(
        "This project uses kit format 99; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>",
      ),
    );
  });

  it("rejects format 4, the first one after the supported range", () => {
    expect(() => assertSupportedKitFormat(4)).toThrow(
      new Error(
        "This project uses kit format 4; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>",
      ),
    );
  });

  it("rejects format 0", () => {
    expect(() => assertSupportedKitFormat(0)).toThrow(
      new Error(
        "This project uses kit format 0; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>",
      ),
    );
  });

  test.prop([
    fc
      .integer({ min: -1000, max: 1000 })
      .filter((n) => n !== 1 && n !== 2 && n !== 3),
  ])("rejects every format other than 1, 2 and 3 and names it", (format) => {
    expect(() => assertSupportedKitFormat(format)).toThrow(
      `This project uses kit format ${format}; update gato-cli`,
    );
  });
});
