import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import type { ModuleDef } from "../define-module";
import {
  applyGatoConfig,
  brandingProblems,
  GatoConfigError,
  gatoBrandingOf,
  gatoConfigProblems,
  type GatoConfig,
} from "../gato-config";

const VALID_LOGO = { src: "/logo.svg", alt: "Acme", width: 120, height: 32 };

function withLogo(overrides: Partial<typeof VALID_LOGO>): GatoConfig {
  return { branding: { logo: { ...VALID_LOGO, ...overrides } } };
}

function dashboardModule(): ModuleDef {
  return {
    key: "dashboard",
    nav: [
      {
        id: "dashboard.home",
        href: "/dashboard",
        labelKey: "nav",
        icon: "layout-dashboard",
        order: 10,
      },
    ],
    routePrefixes: ["/dashboard"],
  };
}

describe("brandingProblems: valid configs", () => {
  it("a config without branding has no problems", () => {
    expect(brandingProblems({})).toEqual([]);
  });

  it("an empty branding object has no problems", () => {
    expect(brandingProblems({ branding: {} })).toEqual([]);
  });

  it("a logo with an absolute src, an alt and positive integer dimensions has no problems", () => {
    expect(brandingProblems(withLogo({}))).toEqual([]);
  });

  it("src of a single slash is accepted", () => {
    expect(brandingProblems(withLogo({ src: "/" }))).toEqual([]);
  });

  it("a nested public path is accepted", () => {
    expect(brandingProblems(withLogo({ src: "/brand/logo-dark.png" }))).toEqual(
      [],
    );
  });

  it("width 1 and height 1 are the smallest accepted dimensions", () => {
    expect(brandingProblems(withLogo({ width: 1, height: 1 }))).toEqual([]);
  });

  it("an alt with surrounding spaces is accepted", () => {
    expect(brandingProblems(withLogo({ alt: " Acme " }))).toEqual([]);
  });
});

describe("brandingProblems: src", () => {
  it("a relative src is rejected naming branding.logo.src and the value", () => {
    expect(brandingProblems(withLogo({ src: "logo.svg" }))).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): logo.svg',
    ]);
  });

  it("a protocol-relative src is rejected", () => {
    expect(
      brandingProblems(withLogo({ src: "//cdn.example.com/logo.svg" })),
    ).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): //cdn.example.com/logo.svg',
    ]);
  });

  it("an absolute URL is rejected", () => {
    expect(
      brandingProblems(withLogo({ src: "https://cdn.example.com/logo.svg" })),
    ).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): https://cdn.example.com/logo.svg',
    ]);
  });

  it("a dot-relative src is rejected", () => {
    expect(brandingProblems(withLogo({ src: "./logo.svg" }))).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): ./logo.svg',
    ]);
  });

  it("an empty src is rejected", () => {
    expect(brandingProblems(withLogo({ src: "" }))).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): ',
    ]);
  });

  test.prop([fc.string().filter((src) => !src.startsWith("/"))])(
    "every src not starting with a slash is rejected with its value",
    (src) => {
      expect(brandingProblems(withLogo({ src }))).toEqual([
        `branding.logo.src: must start with a single "/" (a file in public/): ${src}`,
      ]);
    },
  );

  test.prop([fc.string()])(
    "every src starting with two slashes is rejected",
    (rest) => {
      const src = `//${rest}`;
      expect(brandingProblems(withLogo({ src }))).toEqual([
        `branding.logo.src: must start with a single "/" (a file in public/): ${src}`,
      ]);
    },
  );

  test.prop([fc.string().filter((rest) => !rest.startsWith("/"))])(
    "every src with exactly one leading slash is accepted",
    (rest) => {
      expect(brandingProblems(withLogo({ src: `/${rest}` }))).toEqual([]);
    },
  );
});

describe("brandingProblems: alt", () => {
  it("blank alt is rejected", () => {
    expect(brandingProblems(withLogo({ alt: "  " }))).toEqual([
      "branding.logo.alt: must not be blank",
    ]);
  });

  it("empty alt is rejected", () => {
    expect(brandingProblems(withLogo({ alt: "" }))).toEqual([
      "branding.logo.alt: must not be blank",
    ]);
  });

  it("alt of only tabs and newlines is rejected", () => {
    expect(brandingProblems(withLogo({ alt: "\t\n" }))).toEqual([
      "branding.logo.alt: must not be blank",
    ]);
  });
});

describe("brandingProblems: dimensions", () => {
  it("width 0 is rejected naming the width", () => {
    expect(brandingProblems(withLogo({ width: 0 }))).toEqual([
      "branding.logo.width: must be a positive integer: 0",
    ]);
  });

  it("height -1 is rejected naming the height", () => {
    expect(brandingProblems(withLogo({ height: -1 }))).toEqual([
      "branding.logo.height: must be a positive integer: -1",
    ]);
  });

  it("width 1.5 is rejected because it is not an integer", () => {
    expect(brandingProblems(withLogo({ width: 1.5 }))).toEqual([
      "branding.logo.width: must be a positive integer: 1.5",
    ]);
  });

  it("height 0.5 is rejected because it is not an integer", () => {
    expect(brandingProblems(withLogo({ height: 0.5 }))).toEqual([
      "branding.logo.height: must be a positive integer: 0.5",
    ]);
  });

  it("height 0 is rejected naming the height", () => {
    expect(brandingProblems(withLogo({ height: 0 }))).toEqual([
      "branding.logo.height: must be a positive integer: 0",
    ]);
  });

  it("width -1 is rejected naming the width", () => {
    expect(brandingProblems(withLogo({ width: -1 }))).toEqual([
      "branding.logo.width: must be a positive integer: -1",
    ]);
  });

  it("NaN and Infinity are rejected", () => {
    expect(
      brandingProblems(withLogo({ width: Number.NaN, height: Infinity })),
    ).toEqual([
      "branding.logo.width: must be a positive integer: NaN",
      "branding.logo.height: must be a positive integer: Infinity",
    ]);
  });

  test.prop([fc.integer({ min: 1, max: 100_000 })])(
    "every positive integer is an accepted width and height",
    (size) => {
      expect(brandingProblems(withLogo({ width: size, height: size }))).toEqual(
        [],
      );
    },
  );

  test.prop([fc.integer({ min: -100_000, max: 0 })])(
    "every integer at or below zero is a rejected width",
    (width) => {
      expect(brandingProblems(withLogo({ width }))).toEqual([
        `branding.logo.width: must be a positive integer: ${width}`,
      ]);
    },
  );

  test.prop([
    fc
      .double({ min: 0.01, max: 10_000, noNaN: true })
      .filter((value) => !Number.isInteger(value)),
  ])("every positive non-integer is a rejected height", (height) => {
    expect(brandingProblems(withLogo({ height }))).toEqual([
      `branding.logo.height: must be a positive integer: ${height}`,
    ]);
  });
});

describe("brandingProblems: every problem at once", () => {
  it("lists src, alt, width and height in this order", () => {
    expect(
      brandingProblems({
        branding: {
          logo: { src: "logo.svg", alt: " ", width: 0, height: -1 },
        },
      }),
    ).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): logo.svg',
      "branding.logo.alt: must not be blank",
      "branding.logo.width: must be a positive integer: 0",
      "branding.logo.height: must be a positive integer: -1",
    ]);
  });

  it("width and height both wrong list width before height", () => {
    expect(brandingProblems(withLogo({ width: 1.5, height: 0 }))).toEqual([
      "branding.logo.width: must be a positive integer: 1.5",
      "branding.logo.height: must be a positive integer: 0",
    ]);
  });

  it("src and height wrong skip the valid alt and width", () => {
    expect(
      brandingProblems(withLogo({ src: "//x/logo.svg", height: -1 })),
    ).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): //x/logo.svg',
      "branding.logo.height: must be a positive integer: -1",
    ]);
  });
});

describe("gatoBrandingOf", () => {
  it("returns an empty object for a config without branding", () => {
    expect(gatoBrandingOf({})).toEqual({});
  });

  it("returns an empty object for the empty branding", () => {
    expect(gatoBrandingOf({ branding: {} })).toEqual({});
  });

  it("returns a valid branding as it is", () => {
    const branding = {
      logo: { src: "/logo.svg", alt: "Acme", width: 120, height: 32 },
    };
    const result = gatoBrandingOf({ branding });
    expect(result).toBe(branding);
    expect(result).toEqual({
      logo: { src: "/logo.svg", alt: "Acme", width: 120, height: 32 },
    });
  });

  it("a relative src throws GatoConfigError naming branding.logo.src", () => {
    let caught: unknown;
    try {
      gatoBrandingOf(withLogo({ src: "logo.svg" }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GatoConfigError);
    expect((caught as GatoConfigError).name).toBe("GatoConfigError");
    expect((caught as GatoConfigError).message).toContain("branding.logo.src");
    expect((caught as GatoConfigError).problems).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): logo.svg',
    ]);
  });

  it("several bad fields throw one error listing all of them", () => {
    expect(() =>
      gatoBrandingOf({
        branding: {
          logo: {
            src: "//cdn.example.com/a.svg",
            alt: "",
            width: 0,
            height: 1.5,
          },
        },
      }),
    ).toThrow(
      new GatoConfigError([
        'branding.logo.src: must start with a single "/" (a file in public/): //cdn.example.com/a.svg',
        "branding.logo.alt: must not be blank",
        "branding.logo.width: must be a positive integer: 0",
        "branding.logo.height: must be a positive integer: 1.5",
      ]),
    );
  });

  it("a blank alt alone throws", () => {
    expect(() => gatoBrandingOf(withLogo({ alt: "   " }))).toThrow(
      "branding.logo.alt: must not be blank",
    );
  });

  it("module problems in the config do not make it throw", () => {
    expect(
      gatoBrandingOf({ modules: { billing: {} }, ...withLogo({}) }),
    ).toEqual({
      logo: { src: "/logo.svg", alt: "Acme", width: 120, height: 32 },
    });
  });
});

describe("gatoConfigProblems with branding", () => {
  it("reports branding problems for a config without module overrides", () => {
    expect(
      gatoConfigProblems([dashboardModule()], withLogo({ src: "logo.svg" })),
    ).toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): logo.svg',
    ]);
  });

  it("lists module problems first, then branding problems", () => {
    expect(
      gatoConfigProblems([dashboardModule()], {
        branding: {
          logo: { src: "logo.svg", alt: "Acme", width: 120, height: 0 },
        },
        modules: {
          billing: {},
          dashboard: { nav: { "dashboard.nope": { order: 1 } } },
        },
      }),
    ).toEqual([
      "modules.billing: unknown module: billing",
      "modules.dashboard.nav.dashboard.nope: unknown nav id: dashboard.nope",
      'branding.logo.src: must start with a single "/" (a file in public/): logo.svg',
      "branding.logo.height: must be a positive integer: 0",
    ]);
  });

  it("a valid logo adds no problems", () => {
    expect(gatoConfigProblems([dashboardModule()], withLogo({}))).toEqual([]);
  });
});

describe("applyGatoConfig with branding", () => {
  it("throws GatoConfigError on a bad logo even when the modules are fine", () => {
    expect(() =>
      applyGatoConfig([dashboardModule()], withLogo({ width: 0 })),
    ).toThrow(
      new GatoConfigError([
        "branding.logo.width: must be a positive integer: 0",
      ]),
    );
  });

  it("a protocol-relative src makes it throw an error naming branding.logo.src", () => {
    expect(() =>
      applyGatoConfig(
        [dashboardModule()],
        withLogo({ src: "//cdn.example.com/logo.svg" }),
      ),
    ).toThrow("branding.logo.src");
  });

  it("a valid logo keeps every module", () => {
    expect(
      applyGatoConfig([dashboardModule()], withLogo({})).map(
        (moduleDef) => moduleDef.key,
      ),
    ).toEqual(["dashboard"]);
  });
});
