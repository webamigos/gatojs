import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import type { OrgRole } from "@/shared/lib/auth/roles";
import type { ModuleDef } from "../define-module";
import {
  applyGatoConfig,
  defineGatoConfig,
  emptyGatoConfig,
  enabledEntries,
  GatoConfigError,
  gatoConfigProblems,
  UNDISABLEABLE_MODULES,
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

function usersModule(): ModuleDef {
  return {
    key: "users",
    nav: [
      {
        id: "users.list",
        href: "/users",
        labelKey: "nav",
        multiOrgLabelKey: "nav-members",
        icon: "users",
        order: 80,
      },
    ],
    routePrefixes: ["/users"],
    adminOnly: true,
    multiOrgRoles: ["owner", "admin"],
  };
}

function apiKeysModule(): ModuleDef {
  return {
    key: "api-keys",
    nav: [
      {
        id: "api-keys.list",
        href: "/api-keys",
        labelKey: "nav",
        icon: "key-round",
        order: 85,
      },
    ],
    routePrefixes: ["/api-keys"],
    roles: ["owner", "admin"],
    apiScopes: [
      { key: "organization:read", labelKey: "scopes.organizationRead" },
    ],
  };
}

function reportsModule(): ModuleDef {
  return {
    key: "reports",
    nav: [
      {
        id: "reports.list",
        href: "/reports",
        labelKey: "nav",
        icon: "chart",
        order: 30,
      },
      {
        id: "reports.archive",
        href: "/reports/archive",
        labelKey: "nav-archive",
        icon: "archive",
        order: 31,
      },
    ],
    routePrefixes: ["/reports"],
    auditActions: [{ action: "report.created", labelKey: "action-created" }],
  };
}

function authModule(): ModuleDef {
  return { key: "auth", nav: [], routePrefixes: ["/sign-in"], public: true };
}

function organizationsModule(): ModuleDef {
  return {
    key: "organizations",
    nav: [],
    routePrefixes: ["/no-organization"],
    public: true,
  };
}

function allModules(): ModuleDef[] {
  return [
    authModule(),
    organizationsModule(),
    dashboardModule(),
    usersModule(),
    apiKeysModule(),
    reportsModule(),
  ];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

function problemsOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof GatoConfigError) {
      return error.problems;
    }
    throw error;
  }
  throw new Error("expected GatoConfigError");
}

describe("gato-config constants", () => {
  it("emptyGatoConfig is an empty object", () => {
    expect(emptyGatoConfig).toEqual({});
  });

  it("auth and organizations are the modules that cannot be disabled", () => {
    expect(UNDISABLEABLE_MODULES).toEqual(["auth", "organizations"]);
  });

  it("defineGatoConfig returns its argument unchanged", () => {
    const config: GatoConfig = {
      modules: { "api-keys": { enabled: false } },
    };
    expect(defineGatoConfig(config)).toBe(config);
  });
});

describe("GatoConfigError", () => {
  it("has the string name GatoConfigError and lists problems in the message", () => {
    const error = new GatoConfigError(["first problem", "second problem"]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GatoConfigError");
    expect(error.problems).toEqual(["first problem", "second problem"]);
    expect(error.message).toBe(
      "Invalid src/gato.config.ts:\n- first problem\n- second problem",
    );
  });

  it("a single problem gives a single bullet line", () => {
    expect(new GatoConfigError(["only one"]).message).toBe(
      "Invalid src/gato.config.ts:\n- only one",
    );
  });
});

describe("applyGatoConfig: enabled", () => {
  it("enabled false on api-keys removes it and keeps dashboard", () => {
    expect(
      applyGatoConfig([dashboardModule(), apiKeysModule()], {
        modules: { "api-keys": { enabled: false } },
      }),
    ).toEqual([dashboardModule()]);
  });

  it("removing a module in the middle keeps the order of the others", () => {
    expect(
      applyGatoConfig(allModules(), {
        modules: { dashboard: { enabled: false } },
      }).map((moduleDef) => moduleDef.key),
    ).toEqual(["auth", "organizations", "users", "api-keys", "reports"]);
  });

  it("enabled true and a config without enabled keep the module", () => {
    expect(
      applyGatoConfig([dashboardModule(), apiKeysModule()], {
        modules: { "api-keys": { enabled: true }, dashboard: {} },
      }),
    ).toEqual([dashboardModule(), apiKeysModule()]);
  });

  it("several disabled modules are all removed", () => {
    expect(
      applyGatoConfig(allModules(), {
        modules: {
          users: { enabled: false },
          reports: { enabled: false },
        },
      }).map((moduleDef) => moduleDef.key),
    ).toEqual(["auth", "organizations", "dashboard", "api-keys"]);
  });
});

describe("applyGatoConfig: modules that cannot be disabled", () => {
  it("disabling auth throws GatoConfigError naming auth", () => {
    expect(() =>
      applyGatoConfig(allModules(), { modules: { auth: { enabled: false } } }),
    ).toThrow(GatoConfigError);
    expect(() =>
      applyGatoConfig(allModules(), { modules: { auth: { enabled: false } } }),
    ).toThrow("modules.auth.enabled: auth cannot be disabled");
  });

  it("disabling organizations throws GatoConfigError naming organizations", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig(allModules(), {
          modules: { organizations: { enabled: false } },
        }),
      ),
    ).toEqual([
      "modules.organizations.enabled: organizations cannot be disabled",
    ]);
  });

  it("disabling both reports both problems in config key order", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig(allModules(), {
          modules: {
            organizations: { enabled: false },
            auth: { enabled: false },
          },
        }),
      ),
    ).toEqual([
      "modules.organizations.enabled: organizations cannot be disabled",
      "modules.auth.enabled: auth cannot be disabled",
    ]);
  });

  it("enabled true on auth and organizations passes and keeps every module", () => {
    expect(
      applyGatoConfig(allModules(), {
        modules: {
          auth: { enabled: true },
          organizations: { enabled: true },
        },
      }),
    ).toEqual(allModules());
  });
});

describe("applyGatoConfig: unknown module keys", () => {
  it("an unknown module key throws naming the key", () => {
    expect(() =>
      applyGatoConfig(allModules(), { modules: { billing: {} } }),
    ).toThrow("modules.billing: unknown module: billing");
  });

  it("two unknown keys throw one error listing both", () => {
    let caught: unknown;
    try {
      applyGatoConfig(allModules(), { modules: { billing: {}, crm: {} } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GatoConfigError);
    const error = caught as GatoConfigError;
    expect(error.name).toBe("GatoConfigError");
    expect(error.problems).toEqual([
      "modules.billing: unknown module: billing",
      "modules.crm: unknown module: crm",
    ]);
    expect(error.message).toBe(
      "Invalid src/gato.config.ts:\n- modules.billing: unknown module: billing\n- modules.crm: unknown module: crm",
    );
  });

  it("an unknown module key reports nothing else for that key", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig(allModules(), {
          modules: {
            billing: {
              enabled: false,
              nav: { "billing.list": { order: 1 } },
              access: {},
            },
          },
        }),
      ),
    ).toEqual(["modules.billing: unknown module: billing"]);
  });

  it("a key of a module missing from the list is unknown even if it exists elsewhere", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig([dashboardModule()], {
          modules: { "api-keys": { enabled: false } },
        }),
      ),
    ).toEqual(["modules.api-keys: unknown module: api-keys"]);
  });
});

describe("applyGatoConfig: nav overrides", () => {
  it("order 5 on dashboard.home changes only the order of that item", () => {
    const [dashboard] = applyGatoConfig([dashboardModule()], {
      modules: { dashboard: { nav: { "dashboard.home": { order: 5 } } } },
    });
    expect(dashboard).toEqual({
      key: "dashboard",
      nav: [
        {
          id: "dashboard.home",
          href: "/dashboard",
          labelKey: "nav",
          icon: "layout-dashboard",
          order: 5,
        },
      ],
      routePrefixes: ["/dashboard"],
    });
  });

  it("an order override keeps the optional fields of the item", () => {
    const [users] = applyGatoConfig([usersModule()], {
      modules: { users: { nav: { "users.list": { order: 1 } } } },
    });
    expect(users?.nav).toEqual([
      {
        id: "users.list",
        href: "/users",
        labelKey: "nav",
        multiOrgLabelKey: "nav-members",
        icon: "users",
        order: 1,
      },
    ]);
  });

  it("an order override on the second item leaves the first unchanged", () => {
    const [reports] = applyGatoConfig([reportsModule()], {
      modules: { reports: { nav: { "reports.archive": { order: 99 } } } },
    });
    expect(reports?.nav).toEqual([
      {
        id: "reports.list",
        href: "/reports",
        labelKey: "nav",
        icon: "chart",
        order: 30,
      },
      {
        id: "reports.archive",
        href: "/reports/archive",
        labelKey: "nav-archive",
        icon: "archive",
        order: 99,
      },
    ]);
  });

  it("order 0 is applied, not treated as missing", () => {
    const [dashboard] = applyGatoConfig([dashboardModule()], {
      modules: { dashboard: { nav: { "dashboard.home": { order: 0 } } } },
    });
    expect(dashboard?.nav[0]?.order).toBe(0);
  });

  it("an empty override leaves the item unchanged", () => {
    expect(
      applyGatoConfig([dashboardModule()], {
        modules: { dashboard: { nav: { "dashboard.home": {} } } },
      }),
    ).toEqual([dashboardModule()]);
  });

  it("hidden false with an order keeps the item and applies the order", () => {
    const [dashboard] = applyGatoConfig([dashboardModule()], {
      modules: {
        dashboard: { nav: { "dashboard.home": { hidden: false, order: 7 } } },
      },
    });
    expect(dashboard?.nav).toEqual([
      {
        id: "dashboard.home",
        href: "/dashboard",
        labelKey: "nav",
        icon: "layout-dashboard",
        order: 7,
      },
    ]);
  });

  it("a nav override on one module does not touch another module", () => {
    const result = applyGatoConfig([dashboardModule(), usersModule()], {
      modules: { dashboard: { nav: { "dashboard.home": { order: 5 } } } },
    });
    expect(result[1]).toEqual(usersModule());
  });

  it("an unknown nav id throws naming the path and the id", () => {
    expect(() =>
      applyGatoConfig([dashboardModule()], {
        modules: { dashboard: { nav: { "dashboard.nope": { order: 1 } } } },
      }),
    ).toThrow(
      "modules.dashboard.nav.dashboard.nope: unknown nav id: dashboard.nope",
    );
  });

  it("a nav id of another module is unknown for this module", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig([dashboardModule(), usersModule()], {
          modules: { dashboard: { nav: { "users.list": { hidden: true } } } },
        }),
      ),
    ).toEqual(["modules.dashboard.nav.users.list: unknown nav id: users.list"]);
  });

  it("every unknown nav id of a module is reported, in key order", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig([reportsModule()], {
          modules: {
            reports: {
              nav: {
                "reports.zeta": {},
                "reports.list": { order: 1 },
                "reports.alpha": {},
              },
            },
          },
        }),
      ),
    ).toEqual([
      "modules.reports.nav.reports.zeta: unknown nav id: reports.zeta",
      "modules.reports.nav.reports.alpha: unknown nav id: reports.alpha",
    ]);
  });
});

describe("applyGatoConfig: hidden nav items", () => {
  it("hidden dashboard.home leaves dashboard with an empty nav and other fields", () => {
    expect(
      applyGatoConfig([dashboardModule()], {
        modules: { dashboard: { nav: { "dashboard.home": { hidden: true } } } },
      }),
    ).toEqual([{ key: "dashboard", nav: [], routePrefixes: ["/dashboard"] }]);
  });

  it("hiding one item of two keeps the other item", () => {
    const [reports] = applyGatoConfig([reportsModule()], {
      modules: { reports: { nav: { "reports.archive": { hidden: true } } } },
    });
    expect(reports).toEqual({
      key: "reports",
      nav: [
        {
          id: "reports.list",
          href: "/reports",
          labelKey: "nav",
          icon: "chart",
          order: 30,
        },
      ],
      routePrefixes: ["/reports"],
      auditActions: [{ action: "report.created", labelKey: "action-created" }],
    });
  });

  it("hidden with an order still removes the item", () => {
    const [dashboard] = applyGatoConfig([dashboardModule()], {
      modules: {
        dashboard: { nav: { "dashboard.home": { hidden: true, order: 3 } } },
      },
    });
    expect(dashboard?.nav).toEqual([]);
  });
});

describe("applyGatoConfig: access overrides", () => {
  it("roles owner on users replaces the whole access policy", () => {
    const [users] = applyGatoConfig([usersModule()], {
      modules: { users: { access: { roles: ["owner"] } } },
    });
    expect(users).toEqual({
      key: "users",
      nav: [
        {
          id: "users.list",
          href: "/users",
          labelKey: "nav",
          multiOrgLabelKey: "nav-members",
          icon: "users",
          order: 80,
        },
      ],
      routePrefixes: ["/users"],
      roles: ["owner"],
    });
    expect(users?.adminOnly).toBeUndefined();
    expect(users?.multiOrgRoles).toBeUndefined();
  });

  it("adminOnly with multiOrgRoles on api-keys drops its roles and keeps apiScopes", () => {
    const [apiKeys] = applyGatoConfig([apiKeysModule()], {
      modules: {
        "api-keys": { access: { adminOnly: true, multiOrgRoles: ["owner"] } },
      },
    });
    expect(apiKeys?.roles).toBeUndefined();
    expect(apiKeys?.adminOnly).toBe(true);
    expect(apiKeys?.multiOrgRoles).toEqual(["owner"]);
    expect(apiKeys?.apiScopes).toEqual([
      { key: "organization:read", labelKey: "scopes.organizationRead" },
    ]);
    expect(apiKeys?.routePrefixes).toEqual(["/api-keys"]);
    expect(apiKeys?.nav).toEqual(apiKeysModule().nav);
  });

  it("adminOnly false alone is a valid override and clears the other fields", () => {
    const [users] = applyGatoConfig([usersModule()], {
      modules: { users: { access: { adminOnly: false } } },
    });
    expect(users?.adminOnly).toBe(false);
    expect(users?.roles).toBeUndefined();
    expect(users?.multiOrgRoles).toBeUndefined();
  });

  it("multiOrgRoles alone is a valid override and clears roles and adminOnly", () => {
    const [users] = applyGatoConfig([usersModule()], {
      modules: { users: { access: { multiOrgRoles: ["owner"] } } },
    });
    expect(users?.multiOrgRoles).toEqual(["owner"]);
    expect(users?.roles).toBeUndefined();
    expect(users?.adminOnly).toBeUndefined();
    expect(
      gatoConfigProblems([usersModule()], {
        modules: { users: { access: { multiOrgRoles: ["owner"] } } },
      }),
    ).toEqual([]);
  });

  it("an empty roles list is a valid override", () => {
    const [apiKeys] = applyGatoConfig([apiKeysModule()], {
      modules: { "api-keys": { access: { roles: [] } } },
    });
    expect(apiKeys?.roles).toEqual([]);
  });

  it("an access override on users does not touch api-keys", () => {
    const result = applyGatoConfig([usersModule(), apiKeysModule()], {
      modules: { users: { access: { roles: ["owner"] } } },
    });
    expect(result[1]).toEqual(apiKeysModule());
  });

  it("an access override that sets nothing throws naming the path", () => {
    expect(() =>
      applyGatoConfig([usersModule()], { modules: { users: { access: {} } } }),
    ).toThrow(
      "modules.users.access: access override sets none of roles, adminOnly, multiOrgRoles",
    );
  });
});

describe("applyGatoConfig: every problem at once", () => {
  it("collects problems across keys in config key order", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig(allModules(), {
          modules: {
            crm: {},
            auth: { enabled: false },
            dashboard: { nav: { "dashboard.nope": { order: 1 } } },
            users: { access: {} },
          },
        }),
      ),
    ).toEqual([
      "modules.crm: unknown module: crm",
      "modules.auth.enabled: auth cannot be disabled",
      "modules.dashboard.nav.dashboard.nope: unknown nav id: dashboard.nope",
      "modules.users.access: access override sets none of roles, adminOnly, multiOrgRoles",
    ]);
  });

  it("within one key the order is enabled, nav, access", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig(allModules(), {
          modules: {
            auth: { access: {}, nav: { "auth.x": {} }, enabled: false },
          },
        }),
      ),
    ).toEqual([
      "modules.auth.enabled: auth cannot be disabled",
      "modules.auth.nav.auth.x: unknown nav id: auth.x",
      "modules.auth.access: access override sets none of roles, adminOnly, multiOrgRoles",
    ]);
  });

  it("a disabled module is still validated", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig(allModules(), {
          modules: {
            "api-keys": { enabled: false, nav: { "api-keys.nope": {} } },
          },
        }),
      ),
    ).toEqual([
      "modules.api-keys.nav.api-keys.nope: unknown nav id: api-keys.nope",
    ]);
  });
});

describe("gatoConfigProblems", () => {
  it("returns an empty list for a valid config", () => {
    expect(
      gatoConfigProblems(allModules(), {
        modules: {
          "api-keys": { enabled: false },
          dashboard: { nav: { "dashboard.home": { order: 5 } } },
          users: { access: { roles: ["owner"] } },
        },
      }),
    ).toEqual([]);
  });

  it("returns an empty list for an empty config", () => {
    expect(gatoConfigProblems(allModules(), emptyGatoConfig)).toEqual([]);
  });

  it("returns the problems without throwing", () => {
    expect(
      gatoConfigProblems(allModules(), {
        modules: { billing: {}, auth: { enabled: false } },
      }),
    ).toEqual([
      "modules.billing: unknown module: billing",
      "modules.auth.enabled: auth cannot be disabled",
    ]);
  });
});

describe("applyGatoConfig: identity and immutability", () => {
  it("emptyGatoConfig gives a list deep-equal to the input, same order", () => {
    const modules = allModules();
    expect(applyGatoConfig(modules, emptyGatoConfig)).toEqual(allModules());
  });

  it("an empty modules map gives the input unchanged", () => {
    expect(applyGatoConfig(allModules(), { modules: {} })).toEqual(
      allModules(),
    );
  });

  it("returns a new array, not the input array", () => {
    const modules = allModules();
    expect(applyGatoConfig(modules, emptyGatoConfig)).not.toBe(modules);
  });

  it.each<[string, GatoConfig]>([
    ["enabled", { modules: { "api-keys": { enabled: false } } }],
    [
      "nav order",
      { modules: { dashboard: { nav: { "dashboard.home": { order: 5 } } } } },
    ],
    [
      "nav hidden",
      {
        modules: { reports: { nav: { "reports.archive": { hidden: true } } } },
      },
    ],
    ["access", { modules: { users: { access: { roles: ["owner"] } } } }],
  ])("a %s override does not mutate frozen inputs", (_, config) => {
    const modules = deepFreeze(allModules());
    const frozenConfig = deepFreeze(structuredClone(config));
    expect(() => applyGatoConfig(modules, frozenConfig)).not.toThrow();
    expect(modules).toEqual(allModules());
  });

  it("the input modules keep their original nav and access after every override", () => {
    const modules = allModules();
    const before = structuredClone(modules);
    applyGatoConfig(modules, {
      modules: {
        "api-keys": { enabled: false },
        dashboard: { nav: { "dashboard.home": { order: 5 } } },
        reports: { nav: { "reports.archive": { hidden: true } } },
        users: { access: { roles: ["owner"] } },
      },
    });
    expect(modules).toEqual(before);
    expect(modules).toHaveLength(6);
  });

  const navItemArbitrary = fc.record({
    id: fc.string(),
    href: fc.string(),
    labelKey: fc.string(),
    icon: fc.string(),
    order: fc.integer(),
  });

  const modulesArbitrary = fc
    .uniqueArray(fc.stringMatching(/^[a-z][a-z-]{0,10}$/), { maxLength: 6 })
    .chain((keys) =>
      fc.tuple(
        ...keys.map((key) =>
          fc.record(
            {
              key: fc.constant(key),
              nav: fc.array(navItemArbitrary, { maxLength: 3 }),
              routePrefixes: fc.array(fc.string(), { maxLength: 2 }),
              roles: fc.subarray<OrgRole>(["owner", "admin", "member"]),
              adminOnly: fc.boolean(),
              public: fc.boolean(),
            },
            { requiredKeys: ["key", "nav", "routePrefixes"] },
          ),
        ),
      ),
    );

  test.prop([modulesArbitrary])(
    "emptyGatoConfig is the identity for any module list",
    (modules) => {
      const before = structuredClone(modules);
      expect(applyGatoConfig(modules as ModuleDef[], emptyGatoConfig)).toEqual(
        before,
      );
      expect(modules).toEqual(before);
    },
  );
});

describe("enabledEntries", () => {
  const entries = [
    { module: "a", value: 1 },
    { module: "b", value: 2 },
  ];

  it("drops the values of a disabled module", () => {
    expect(
      enabledEntries(entries, { modules: { a: { enabled: false } } }),
    ).toEqual([2]);
  });

  it("returns every value with emptyGatoConfig", () => {
    expect(enabledEntries(entries, emptyGatoConfig)).toEqual([1, 2]);
  });

  it("returns every value when the module is enabled true", () => {
    expect(
      enabledEntries(entries, { modules: { a: { enabled: true } } }),
    ).toEqual([1, 2]);
  });

  it("returns every value when the module config has no enabled field", () => {
    expect(
      enabledEntries(entries, {
        modules: { a: { nav: { "a.home": { order: 1 } } } },
      }),
    ).toEqual([1, 2]);
  });

  it("keeps the input order and drops every entry of a disabled module", () => {
    expect(
      enabledEntries(
        [
          { module: "c", value: "c1" },
          { module: "b", value: "b1" },
          { module: "a", value: "a1" },
          { module: "b", value: "b2" },
        ],
        { modules: { b: { enabled: false } } },
      ),
    ).toEqual(["c1", "a1"]);
  });

  it("does not validate unknown module keys", () => {
    expect(
      enabledEntries(entries, { modules: { billing: { enabled: false } } }),
    ).toEqual([1, 2]);
  });

  it("returns an empty list when every module is disabled", () => {
    expect(
      enabledEntries(entries, {
        modules: { a: { enabled: false }, b: { enabled: false } },
      }),
    ).toEqual([]);
  });
});
