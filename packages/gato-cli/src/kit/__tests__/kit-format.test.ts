import { existsSync, readFileSync } from "node:fs";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertSupportedKitFormat,
  SUPPORTED_KIT_FORMATS,
} from "../kit-format.js";

describe("SUPPORTED_KIT_FORMATS", () => {
  it("lists formats 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 and 12", () => {
    expect(SUPPORTED_KIT_FORMATS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
});

const kitJson = new URL("../../../../../kit/kit.json", import.meta.url);

describe.skipIf(!existsSync(kitJson))("kit/kit.json", () => {
  it("declares kitFormat 12", () => {
    expect(JSON.parse(readFileSync(kitJson, "utf8")).kitFormat).toBe(12);
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

  it("accepts format 4 with the gato.config registries", () => {
    expect(() => assertSupportedKitFormat(4)).not.toThrow();
  });

  it("accepts format 5 with the gatoBranding client registry", () => {
    expect(() => assertSupportedKitFormat(5)).not.toThrow();
  });

  it("accepts format 6 with the moduleEvents and moduleSubscribers server registry", () => {
    expect(() => assertSupportedKitFormat(6)).not.toThrow();
  });

  it("accepts format 7 with the moduleSlots and clientModuleSlots registries", () => {
    expect(() => assertSupportedKitFormat(7)).not.toThrow();
  });

  it("accepts format 8 with the moduleCommandHooks server registry", () => {
    expect(() => assertSupportedKitFormat(8)).not.toThrow();
  });

  it("accepts format 9 with the clientComponentOverrides client registry", () => {
    expect(() => assertSupportedKitFormat(9)).not.toThrow();
  });

  it("accepts format 10 with the moduleSetups server registry", () => {
    expect(() => assertSupportedKitFormat(10)).not.toThrow();
  });

  it("accepts format 11 with the extension points catalog", () => {
    expect(() => assertSupportedKitFormat(11)).not.toThrow();
  });

  it("accepts format 12 with modules exporting an authPlugins array", () => {
    expect(() => assertSupportedKitFormat(12)).not.toThrow();
  });

  it("rejects format 99 with the message naming gato-cli@latest and the npx fallback", () => {
    expect(() => assertSupportedKitFormat(99)).toThrow(
      new Error(
        "This project uses kit format 99; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>",
      ),
    );
  });

  it("rejects format 13, the first one after the supported range", () => {
    expect(() => assertSupportedKitFormat(13)).toThrow(
      new Error(
        "This project uses kit format 13; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>",
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
      .filter(
        (n) =>
          n !== 1 &&
          n !== 2 &&
          n !== 3 &&
          n !== 4 &&
          n !== 5 &&
          n !== 6 &&
          n !== 7 &&
          n !== 8 &&
          n !== 9 &&
          n !== 10 &&
          n !== 11 &&
          n !== 12,
      ),
  ])(
    "rejects every format other than 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 and 12 and names it",
    (format) => {
      expect(() => assertSupportedKitFormat(format)).toThrow(
        `This project uses kit format ${format}; update gato-cli`,
      );
    },
  );
});
