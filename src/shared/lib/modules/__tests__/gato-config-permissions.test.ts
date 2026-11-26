import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import type { OrgRole } from "@/shared/lib/auth/roles";
import type { ModuleDef } from "../define-module";
import {
  applyGatoConfig,
  GatoConfigError,
  gatoConfigProblems,
  type GatoConfig,
} from "../gato-config";

function uploadsModule(): ModuleDef {
  return {
    key: "uploads",
    nav: [
      {
        id: "uploads.list",
        href: "/uploads",
        labelKey: "nav",
        icon: "file",
        order: 40,
      },
    ],
    routePrefixes: ["/uploads"],
    permissions: {
      "uploads.delete-others": {
        defaultRoles: ["owner", "admin"],
        labelKey: "permission-delete-others",
      },
      "uploads.purge": {
        defaultRoles: ["admin"],
        labelKey: "permission-purge",
      },
    },
  };
}

function reportsModule(): ModuleDef {
  return {
    key: "reports",
    nav: [],
    routePrefixes: ["/reports"],
    permissions: {
      "reports.export": {
        defaultRoles: ["owner"],
        labelKey: "permission-export",
      },
    },
  };
}

function dashboardModule(): ModuleDef {
  return { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] };
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
  return [];
}

function permissionsNamed(key: string): Record<string, OrgRole[]> {
  return { [key]: ["owner"] };
}

function moduleByKey(modules: readonly ModuleDef[], key: string): ModuleDef {
  const found = modules.find((moduleDef) => moduleDef.key === key);
  if (found === undefined) {
    throw new Error(`fixture module ${key} missing`);
  }
  return found;
}

describe("applyGatoConfig with a permission override", () => {
  it("replaces defaultRoles of the overridden permission with exactly the configured array", () => {
    const [uploads] = applyGatoConfig([uploadsModule()], {
      modules: {
        uploads: { permissions: { "uploads.delete-others": ["owner"] } },
      },
    });

    expect(
      uploads!.permissions?.["uploads.delete-others"]?.defaultRoles,
    ).toEqual(["owner"]);
  });

  it("keeps the labelKey of the overridden permission", () => {
    const [uploads] = applyGatoConfig([uploadsModule()], {
      modules: {
        uploads: { permissions: { "uploads.delete-others": ["owner"] } },
      },
    });

    expect(uploads!.permissions?.["uploads.delete-others"]).toEqual({
      defaultRoles: ["owner"],
      labelKey: "permission-delete-others",
    });
  });

  it("keeps the other permissions of the module unchanged", () => {
    const [uploads] = applyGatoConfig([uploadsModule()], {
      modules: {
        uploads: { permissions: { "uploads.delete-others": ["owner"] } },
      },
    });

    expect(uploads!.permissions).toEqual({
      "uploads.delete-others": {
        defaultRoles: ["owner"],
        labelKey: "permission-delete-others",
      },
      "uploads.purge": {
        defaultRoles: ["admin"],
        labelKey: "permission-purge",
      },
    });
  });

  it("replaces with a role the defaults did not contain instead of adding it", () => {
    const [uploads] = applyGatoConfig([uploadsModule()], {
      modules: {
        uploads: { permissions: { "uploads.delete-others": ["member"] } },
      },
    });

    expect(
      uploads!.permissions?.["uploads.delete-others"]?.defaultRoles,
    ).toEqual(["member"]);
  });

  it("replaces with an empty array, so no org role keeps the permission", () => {
    const [uploads] = applyGatoConfig([uploadsModule()], {
      modules: { uploads: { permissions: { "uploads.purge": [] } } },
    });

    expect(uploads!.permissions?.["uploads.purge"]).toEqual({
      defaultRoles: [],
      labelKey: "permission-purge",
    });
  });

  it("overrides two permissions of one module at once", () => {
    const [uploads] = applyGatoConfig([uploadsModule()], {
      modules: {
        uploads: {
          permissions: {
            "uploads.delete-others": ["member", "owner"],
            "uploads.purge": ["owner"],
          },
        },
      },
    });

    expect(uploads!.permissions).toEqual({
      "uploads.delete-others": {
        defaultRoles: ["member", "owner"],
        labelKey: "permission-delete-others",
      },
      "uploads.purge": {
        defaultRoles: ["owner"],
        labelKey: "permission-purge",
      },
    });
  });

  it("keeps the module's nav, routes and key next to a permission override", () => {
    const [uploads] = applyGatoConfig([uploadsModule()], {
      modules: { uploads: { permissions: { "uploads.purge": ["owner"] } } },
    });

    expect(uploads!.key).toBe("uploads");
    expect(uploads!.routePrefixes).toEqual(["/uploads"]);
    expect(uploads!.nav).toEqual([
      {
        id: "uploads.list",
        href: "/uploads",
        labelKey: "nav",
        icon: "file",
        order: 40,
      },
    ]);
  });

  it("applies a permission override together with a nav override", () => {
    const [uploads] = applyGatoConfig([uploadsModule()], {
      modules: {
        uploads: {
          nav: { "uploads.list": { order: 5 } },
          permissions: { "uploads.purge": ["owner"] },
        },
      },
    });

    expect(uploads!.nav[0]?.order).toBe(5);
    expect(uploads!.permissions?.["uploads.purge"]?.defaultRoles).toEqual([
      "owner",
    ]);
  });

  it("does not touch the permissions of a module the config does not name", () => {
    const modules = applyGatoConfig([uploadsModule(), reportsModule()], {
      modules: { uploads: { permissions: { "uploads.purge": ["owner"] } } },
    });

    expect(moduleByKey(modules, "reports").permissions).toEqual({
      "reports.export": {
        defaultRoles: ["owner"],
        labelKey: "permission-export",
      },
    });
  });

  it("keeps the permissions of a module whose config has no permissions entry", () => {
    const modules = applyGatoConfig([uploadsModule()], {
      modules: { uploads: { nav: { "uploads.list": { hidden: true } } } },
    });

    expect(moduleByKey(modules, "uploads").permissions).toEqual({
      "uploads.delete-others": {
        defaultRoles: ["owner", "admin"],
        labelKey: "permission-delete-others",
      },
      "uploads.purge": {
        defaultRoles: ["admin"],
        labelKey: "permission-purge",
      },
    });
  });

  it("keeps the permissions of a module whose config sets only access", () => {
    const modules = applyGatoConfig([uploadsModule()], {
      modules: { uploads: { access: { roles: ["owner"] } } },
    });

    expect(moduleByKey(modules, "uploads").permissions).toEqual({
      "uploads.delete-others": {
        defaultRoles: ["owner", "admin"],
        labelKey: "permission-delete-others",
      },
      "uploads.purge": {
        defaultRoles: ["admin"],
        labelKey: "permission-purge",
      },
    });
  });

  it("does not mutate the module definitions or the config", () => {
    const modules = deepFreeze([uploadsModule(), reportsModule()]);
    const config = deepFreeze<GatoConfig>({
      modules: {
        uploads: { permissions: { "uploads.delete-others": ["owner"] } },
      },
    });

    applyGatoConfig(modules, config);

    expect(
      modules[0]!.permissions?.["uploads.delete-others"]?.defaultRoles,
    ).toEqual(["owner", "admin"]);
    expect(config.modules?.uploads?.permissions).toEqual({
      "uploads.delete-others": ["owner"],
    });
  });

  it("an override of one module does not leak into the defaults of a later apply", () => {
    const source = uploadsModule();
    applyGatoConfig([source], {
      modules: {
        uploads: { permissions: { "uploads.delete-others": ["member"] } },
      },
    });

    const [again] = applyGatoConfig([source], {});

    expect(again!.permissions?.["uploads.delete-others"]?.defaultRoles).toEqual(
      ["owner", "admin"],
    );
  });

  test.prop([fc.subarray<OrgRole>(["owner", "admin", "member"])])(
    "the overridden defaultRoles equal the configured roles for any role list",
    (roles) => {
      const [uploads] = applyGatoConfig([uploadsModule()], {
        modules: {
          uploads: { permissions: { "uploads.delete-others": roles } },
        },
      });

      expect(uploads!.permissions?.["uploads.delete-others"]).toEqual({
        defaultRoles: [...roles],
        labelKey: "permission-delete-others",
      });
      expect(uploads!.permissions?.["uploads.purge"]).toEqual({
        defaultRoles: ["admin"],
        labelKey: "permission-purge",
      });
    },
  );
});

describe("applyGatoConfig without a permission override", () => {
  it("returns modules whose permissions deep-equal the definitions", () => {
    const modules = applyGatoConfig(
      [dashboardModule(), uploadsModule(), reportsModule()],
      {},
    );

    expect(modules).toEqual([
      dashboardModule(),
      uploadsModule(),
      reportsModule(),
    ]);
  });

  it("leaves a module without permissions without a permissions field", () => {
    const [dashboard] = applyGatoConfig([dashboardModule()], {
      modules: { dashboard: { enabled: true } },
    });

    expect(dashboard!.permissions).toBeUndefined();
  });
});

describe("gatoConfigProblems for permission keys", () => {
  it("reports a permission the module does not declare", () => {
    expect(
      gatoConfigProblems([uploadsModule()], {
        modules: { uploads: { permissions: { "uploads.nope": ["owner"] } } },
      }),
    ).toEqual([
      "modules.uploads.permissions.uploads.nope: unknown permission: uploads.nope",
    ]);
  });

  it("returns no problem for a declared permission", () => {
    expect(
      gatoConfigProblems([uploadsModule()], {
        modules: {
          uploads: { permissions: { "uploads.delete-others": ["owner"] } },
        },
      }),
    ).toEqual([]);
  });

  it("reports a permission of another module as unknown in this one", () => {
    expect(
      gatoConfigProblems([uploadsModule(), reportsModule()], {
        modules: { uploads: { permissions: { "reports.export": ["owner"] } } },
      }),
    ).toEqual([
      "modules.uploads.permissions.reports.export: unknown permission: reports.export",
    ]);
  });

  it("reports a permission for a module that declares no permissions at all", () => {
    const uploadsWithoutPermissions: ModuleDef = {
      key: "uploads",
      nav: [],
      routePrefixes: [],
    };
    expect(
      gatoConfigProblems([uploadsWithoutPermissions], {
        modules: { uploads: { permissions: { "uploads.nope": ["owner"] } } },
      }),
    ).toEqual([
      "modules.uploads.permissions.uploads.nope: unknown permission: uploads.nope",
    ]);
  });

  it("reports every unknown permission in config key order", () => {
    expect(
      gatoConfigProblems([uploadsModule()], {
        modules: {
          uploads: {
            permissions: {
              "uploads.zeta": ["owner"],
              "uploads.delete-others": ["owner"],
              "uploads.alpha": ["admin"],
            },
          },
        },
      }),
    ).toEqual([
      "modules.uploads.permissions.uploads.zeta: unknown permission: uploads.zeta",
      "modules.uploads.permissions.uploads.alpha: unknown permission: uploads.alpha",
    ]);
  });

  it("reports the nav problem first, then the permission, then the access problem", () => {
    expect(
      gatoConfigProblems([uploadsModule()], {
        modules: {
          uploads: {
            access: {},
            permissions: { "uploads.nope": ["owner"] },
            nav: { "uploads.nope": { order: 1 } },
          },
        },
      }),
    ).toEqual([
      "modules.uploads.nav.uploads.nope: unknown nav id: uploads.nope",
      "modules.uploads.permissions.uploads.nope: unknown permission: uploads.nope",
      "modules.uploads.access: access override sets none of roles, adminOnly, multiOrgRoles",
    ]);
  });

  it("reports only the unknown module when an unknown module names permissions", () => {
    expect(
      gatoConfigProblems([uploadsModule()], {
        modules: { billing: { permissions: { "billing.refund": ["owner"] } } },
      }),
    ).toEqual(["modules.billing: unknown module: billing"]);
  });

  it.each(["constructor", "toString", "hasOwnProperty", "valueOf"])(
    "treats the inherited object key %s as an unknown permission",
    (key) => {
      expect(
        gatoConfigProblems([uploadsModule()], {
          modules: { uploads: { permissions: { [key]: ["owner"] } } },
        }),
      ).toEqual([
        `modules.uploads.permissions.${key}: unknown permission: ${key}`,
      ]);
    },
  );

  it("treats an own __proto__ key as an unknown permission", () => {
    const permissions = JSON.parse('{"__proto__": ["owner"]}') as Record<
      string,
      OrgRole[]
    >;
    expect(
      gatoConfigProblems([uploadsModule()], {
        modules: { uploads: { permissions } },
      }),
    ).toEqual([
      "modules.uploads.permissions.__proto__: unknown permission: __proto__",
    ]);
  });

  it("treats constructor as unknown even for a module without permissions", () => {
    expect(
      gatoConfigProblems([dashboardModule()], {
        modules: {
          dashboard: { permissions: permissionsNamed("constructor") },
        },
      }),
    ).toEqual([
      "modules.dashboard.permissions.constructor: unknown permission: constructor",
    ]);
  });
});

describe("applyGatoConfig with an unknown permission key", () => {
  it("throws GatoConfigError whose problems name the permission path", () => {
    const run = () =>
      applyGatoConfig([uploadsModule()], {
        modules: { uploads: { permissions: { "uploads.nope": ["owner"] } } },
      });

    expect(run).toThrow(GatoConfigError);
    expect(problemsOf(run)).toEqual([
      "modules.uploads.permissions.uploads.nope: unknown permission: uploads.nope",
    ]);
  });

  it("puts the problem into the error message", () => {
    expect(() =>
      applyGatoConfig([uploadsModule()], {
        modules: { uploads: { permissions: { "uploads.nope": ["owner"] } } },
      }),
    ).toThrow(
      "modules.uploads.permissions.uploads.nope: unknown permission: uploads.nope",
    );
  });

  it("throws for a module without permissions given a config permission", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig([dashboardModule()], {
          modules: { dashboard: { permissions: { "dashboard.x": ["owner"] } } },
        }),
      ),
    ).toEqual([
      "modules.dashboard.permissions.dashboard.x: unknown permission: dashboard.x",
    ]);
  });

  it("throws for a toString key instead of overriding something", () => {
    expect(
      problemsOf(() =>
        applyGatoConfig([uploadsModule()], {
          modules: { uploads: { permissions: permissionsNamed("toString") } },
        }),
      ),
    ).toEqual([
      "modules.uploads.permissions.toString: unknown permission: toString",
    ]);
  });
});
