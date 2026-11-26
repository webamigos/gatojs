import { describe, expect, it, vi } from "vitest";
import { fc, test } from "@fast-check/vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

vi.mock("@/modules.client.generated", async () => {
  const { applyGatoConfig } = await import("@/shared/lib/modules/gato-config");
  const modules: ModuleDef[] = [
    {
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
    },
    { key: "uploads", nav: [], routePrefixes: [] },
    {
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
    },
  ];
  return {
    authClientPlugins: [],
    clientModules: applyGatoConfig(modules, {
      modules: { uploads: { enabled: false } },
    }),
  };
});

import {
  ModuleDisabledError,
  isModuleEnabled,
  requireModuleEnabled,
} from "../require-module-enabled";
import { ModuleDisabledError as ModuleDisabledErrorFromOwnFile } from "../module-disabled-error";

describe("isModuleEnabled with uploads disabled in gato.config", () => {
  it("a module disabled in gato.config is not enabled", () => {
    expect(isModuleEnabled("uploads")).toBe(false);
  });

  it("an installed module without overrides is enabled", () => {
    expect(isModuleEnabled("dashboard")).toBe(true);
  });

  it("an installed module with access rules is enabled", () => {
    expect(isModuleEnabled("api-keys")).toBe(true);
  });

  it("a module that is not installed is not enabled", () => {
    expect(isModuleEnabled("billing")).toBe(false);
  });

  it("auth is enabled although it is absent from the registry", () => {
    expect(isModuleEnabled("auth")).toBe(true);
  });

  it("organizations is enabled although it is absent from the registry", () => {
    expect(isModuleEnabled("organizations")).toBe(true);
  });

  test.prop([
    fc
      .string({ minLength: 1, maxLength: 30 })
      .filter(
        (key) =>
          !["dashboard", "api-keys", "auth", "organizations"].includes(key),
      ),
  ])(
    "any key outside the enabled registry and the exemptions is not enabled",
    (key) => {
      expect(isModuleEnabled(key)).toBe(false);
    },
  );
});

describe("requireModuleEnabled with uploads disabled in gato.config", () => {
  it("throws ModuleDisabledError carrying the key for a disabled module", () => {
    let caught: unknown;
    try {
      requireModuleEnabled("uploads");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ModuleDisabledError);
    expect(caught).toBeInstanceOf(ModuleDisabledErrorFromOwnFile);
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({
      name: "ModuleDisabledError",
      moduleKey: "uploads",
      message: "Module disabled: uploads",
    });
  });

  it("throws for a module that is not installed", () => {
    expect(() => requireModuleEnabled("billing")).toThrow(
      "Module disabled: billing",
    );
  });

  it("returns undefined for an enabled module", () => {
    expect(requireModuleEnabled("dashboard")).toBeUndefined();
  });

  it("does not throw for auth, which cannot be disabled", () => {
    expect(() => requireModuleEnabled("auth")).not.toThrow();
  });

  it("does not throw for organizations, which cannot be disabled", () => {
    expect(() => requireModuleEnabled("organizations")).not.toThrow();
  });
});

describe("ModuleDisabledError", () => {
  it("is not a DomainError, so its message never reaches the user", async () => {
    const { DomainError } = await import("@/shared/utils/error-handling");

    expect(new ModuleDisabledErrorFromOwnFile("uploads")).not.toBeInstanceOf(
      DomainError,
    );
  });

  it("builds the message and key from the constructor argument", () => {
    const error = new ModuleDisabledErrorFromOwnFile("api-keys");

    expect(error.name).toBe("ModuleDisabledError");
    expect(error.moduleKey).toBe("api-keys");
    expect(error.message).toBe("Module disabled: api-keys");
  });
});
