import { describe, expect, it } from "vitest";
import type { ModuleDef } from "../define-module";
import {
  applyGatoConfig,
  CORE_SLOTS_CONFIG_KEY,
  GatoConfigError,
  gatoConfigProblems,
  type GatoConfig,
} from "../gato-config";

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

function accountModule(): ModuleDef {
  return { key: "account", nav: [], routePrefixes: ["/account"] };
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("CORE_SLOTS_CONFIG_KEY", () => {
  it("is app", () => {
    expect(CORE_SLOTS_CONFIG_KEY).toBe("app");
  });
});

describe("gatoConfigProblems: the reserved modules.app key", () => {
  it("modules.app with slots is not an unknown module", () => {
    const config: GatoConfig = {
      modules: {
        app: { slots: { "app.header.actions": { "invoices.button": null } } },
      },
    };
    expect(gatoConfigProblems([dashboardModule()], config)).toEqual([]);
  });

  it("an empty modules.app is accepted", () => {
    expect(
      gatoConfigProblems([dashboardModule()], { modules: { app: {} } }),
    ).toEqual([]);
  });

  it("modules.app.enabled is reported as reserved", () => {
    expect(
      gatoConfigProblems([dashboardModule()], {
        modules: { app: { enabled: false } },
      }),
    ).toEqual([
      "modules.app.enabled: app is reserved for core-hosted slots; only slots is allowed",
    ]);
  });

  it("modules.app.enabled true is reported as reserved too", () => {
    expect(
      gatoConfigProblems([dashboardModule()], {
        modules: { app: { enabled: true } },
      }),
    ).toEqual([
      "modules.app.enabled: app is reserved for core-hosted slots; only slots is allowed",
    ]);
  });

  it("every field of modules.app other than slots is reported, in field order", () => {
    expect(
      gatoConfigProblems([dashboardModule()], {
        modules: {
          app: {
            nav: { "app.x": { order: 1 } },
            slots: { "app.header.actions": {} },
            access: { roles: ["owner"] },
            permissions: { "app.y": ["owner"] },
          },
        },
      }),
    ).toEqual([
      "modules.app.nav: app is reserved for core-hosted slots; only slots is allowed",
      "modules.app.access: app is reserved for core-hosted slots; only slots is allowed",
      "modules.app.permissions: app is reserved for core-hosted slots; only slots is allowed",
    ]);
  });

  it("the reserved-key problem sits among the other module problems in config key order", () => {
    expect(
      gatoConfigProblems([dashboardModule()], {
        modules: {
          billing: {},
          app: { enabled: false },
          dashboard: { nav: { "dashboard.nope": { order: 1 } } },
        },
      }),
    ).toEqual([
      "modules.billing: unknown module: billing",
      "modules.app.enabled: app is reserved for core-hosted slots; only slots is allowed",
      "modules.dashboard.nav.dashboard.nope: unknown nav id: dashboard.nope",
    ]);
  });

  it("slots on a feature module are not a gatoConfigProblems concern", () => {
    expect(
      gatoConfigProblems([dashboardModule()], {
        modules: {
          dashboard: {
            slots: {
              "dashboard.sections": { "invoices.card": { priority: 1 } },
            },
          },
        },
      }),
    ).toEqual([]);
  });
});

describe("applyGatoConfig: the reserved modules.app key", () => {
  it("ignores modules.app with slots and returns the modules unchanged", () => {
    const modules = [accountModule(), dashboardModule()];
    expect(
      applyGatoConfig(modules, {
        modules: {
          app: { slots: { "app.header.actions": { "invoices.button": null } } },
        },
      }),
    ).toEqual([accountModule(), dashboardModule()]);
  });

  it("does not add a module named app", () => {
    const result = applyGatoConfig([dashboardModule()], {
      modules: { app: { slots: {} } },
    });
    expect(result.map((moduleDef) => moduleDef.key)).toEqual(["dashboard"]);
  });

  it("throws GatoConfigError for modules.app.enabled", () => {
    const error = thrownBy(() =>
      applyGatoConfig([dashboardModule()], {
        modules: { app: { enabled: false } },
      }),
    );
    expect(error).toBeInstanceOf(GatoConfigError);
    expect((error as GatoConfigError).problems).toEqual([
      "modules.app.enabled: app is reserved for core-hosted slots; only slots is allowed",
    ]);
  });

  it("slots on a feature module leave that module unchanged", () => {
    expect(
      applyGatoConfig([dashboardModule()], {
        modules: {
          dashboard: {
            slots: { "dashboard.sections": { "invoices.card": null } },
          },
        },
      }),
    ).toEqual([dashboardModule()]);
  });
});
