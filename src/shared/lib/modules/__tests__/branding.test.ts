import { describe, expect, it, vi } from "vitest";

const { generatedBranding } = vi.hoisted(() => ({
  generatedBranding: {
    logo: { src: "/brand/acme.svg", alt: "Acme", width: 120, height: 32 },
  },
}));

vi.mock("@/modules.client.generated", () => ({
  authClientPlugins: [],
  clientModules: [],
  gatoBranding: generatedBranding,
}));

import { getBranding } from "../branding";

describe("getBranding", () => {
  it("returns the branding exported by the generated client registry", () => {
    expect(getBranding()).toBe(generatedBranding);
    expect(getBranding()).toEqual({
      logo: { src: "/brand/acme.svg", alt: "Acme", width: 120, height: 32 },
    });
  });
});
