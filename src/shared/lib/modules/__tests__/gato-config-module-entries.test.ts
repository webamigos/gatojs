import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { emptyGatoConfig, enabledModuleEntries } from "../gato-config";

describe("enabledModuleEntries", () => {
  const alpha = { module: "alpha", value: { a: 1 } };
  const beta = { module: "beta", value: { b: 2 } };
  const gamma = { module: "gamma", value: { c: 3 } };

  it("keeps every entry with its module key under emptyGatoConfig", () => {
    expect(enabledModuleEntries([alpha, beta], emptyGatoConfig)).toEqual([
      { module: "alpha", value: { a: 1 } },
      { module: "beta", value: { b: 2 } },
    ]);
  });

  it("drops the entries of a disabled module and keeps the module key of the rest", () => {
    expect(
      enabledModuleEntries([alpha, beta, gamma], {
        modules: { beta: { enabled: false } },
      }),
    ).toEqual([
      { module: "alpha", value: { a: 1 } },
      { module: "gamma", value: { c: 3 } },
    ]);
  });

  it("keeps the input order, not an alphabetical one", () => {
    expect(
      enabledModuleEntries([gamma, alpha, beta], {
        modules: { alpha: { enabled: true } },
      }),
    ).toEqual([
      { module: "gamma", value: { c: 3 } },
      { module: "alpha", value: { a: 1 } },
      { module: "beta", value: { b: 2 } },
    ]);
  });

  it("drops every entry of a disabled module that appears twice", () => {
    const secondAlpha = { module: "alpha", value: { a: 2 } };
    expect(
      enabledModuleEntries([alpha, beta, secondAlpha], {
        modules: { alpha: { enabled: false } },
      }),
    ).toEqual([{ module: "beta", value: { b: 2 } }]);
  });

  it("a module config without enabled keeps the entry", () => {
    expect(
      enabledModuleEntries([alpha], {
        modules: { alpha: { nav: { "alpha.home": { order: 1 } } } },
      }),
    ).toEqual([{ module: "alpha", value: { a: 1 } }]);
  });

  it("returns the same entry objects, not copies", () => {
    const [kept] = enabledModuleEntries([alpha], emptyGatoConfig);
    expect(kept).toBe(alpha);
  });

  it("returns an empty list when every module is disabled", () => {
    expect(
      enabledModuleEntries([alpha, beta], {
        modules: { alpha: { enabled: false }, beta: { enabled: false } },
      }),
    ).toEqual([]);
  });

  test.prop([
    fc.array(fc.constantFrom("a", "b", "c", "d"), { maxLength: 8 }),
    fc.subarray(["a", "b", "c", "d"]),
  ])(
    "the result is the subsequence of entries whose module is not disabled",
    (keys, disabled) => {
      const entries = keys.map((module, index) => ({ module, value: index }));
      const config = {
        modules: Object.fromEntries(
          disabled.map((key) => [key, { enabled: false }]),
        ),
      };

      const kept = enabledModuleEntries(entries, config);

      expect(kept.every((entry) => !disabled.includes(entry.module))).toBe(
        true,
      );
      expect(kept.length).toBe(
        entries.length -
          entries.filter((entry) => disabled.includes(entry.module)).length,
      );
      expect(kept.map((entry) => entry.value)).toEqual(
        [...kept.map((entry) => entry.value)].sort((x, y) => x - y),
      );
      expect(kept.every((entry) => entries.includes(entry))).toBe(true);
    },
  );
});
