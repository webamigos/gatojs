import { describe, expect, it } from "vitest";
import { defineGatoConfig } from "../gato-config";

describe("defineGatoConfig: keys from the extension points catalog", () => {
  it("returns a config that uses only core catalog keys unchanged", () => {
    const config = {
      modules: {
        dashboard: {
          nav: { "dashboard.home": { order: 5 } },
          slots: { "dashboard.sections": {} },
        },
        users: { components: { "users.invite-dialog": null } },
        app: { slots: { "app.header.actions": {} } },
      },
    };
    expect(defineGatoConfig(config)).toBe(config);
  });

  it("rejects an unknown module, nav id, slot, component handle and permission at compile time", () => {
    const configs = [
      defineGatoConfig({
        modules: {
          dashboard: {
            nav: {
              // @ts-expect-error dashboard.nope is not a NavItemId
              "dashboard.nope": { order: 5 },
            },
          },
        },
      }),
      defineGatoConfig({
        modules: {
          // @ts-expect-error billing is not a ModuleKey
          billing: {},
        },
      }),
      defineGatoConfig({
        modules: {
          dashboard: {
            slots: {
              // @ts-expect-error dashboard.nope is not a SlotId
              "dashboard.nope": {},
            },
          },
        },
      }),
      defineGatoConfig({
        modules: {
          users: {
            components: {
              // @ts-expect-error users.nope is not a ComponentHandle
              "users.nope": null,
            },
          },
        },
      }),
      defineGatoConfig({
        modules: {
          dashboard: {
            permissions: {
              // @ts-expect-error dashboard.nope is not a PermissionKey
              "dashboard.nope": ["owner"],
            },
          },
        },
      }),
    ];
    expect(configs).toHaveLength(5);
  });
});
