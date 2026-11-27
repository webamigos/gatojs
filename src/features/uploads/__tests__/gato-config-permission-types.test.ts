import { describe, expect, it } from "vitest";
import { defineGatoConfig } from "@/shared/lib/modules/gato-config";

describe("defineGatoConfig: uploads permission keys", () => {
  it("returns a config that overrides uploads.delete-others unchanged", () => {
    const config = {
      modules: {
        uploads: {
          permissions: { "uploads.delete-others": ["owner" as const] },
        },
      },
    };
    expect(defineGatoConfig(config)).toBe(config);
  });

  it("rejects an unknown uploads permission at compile time", () => {
    const config = defineGatoConfig({
      modules: {
        uploads: {
          permissions: {
            // @ts-expect-error uploads.nope is not a PermissionKey
            "uploads.nope": ["owner"],
          },
        },
      },
    });
    expect(config.modules?.uploads?.permissions).toEqual({
      "uploads.nope": ["owner"],
    });
  });
});
