import { describe, expect, it } from "vitest";
import { replaceRegion } from "../regions.js";

describe("replaceRegion", () => {
  it("zastępuje treść regionu", () => {
    const src = "a\n// wa:x:start\nold\n// wa:x:end\nb\n";
    expect(replaceRegion(src, "f.ts", "x", "new")).toBe("a\n// wa:x:start\nnew\n// wa:x:end\nb\n");
  });

  it("pusty body zostawia region pusty", () => {
    const src = "# wa:x:start\nold\n# wa:x:end\n";
    expect(replaceRegion(src, "f", "x", "")).toBe("# wa:x:start\n# wa:x:end\n");
  });

  it("zachowuje wielolinijkowy body", () => {
    const src = "# wa:x:start\n# wa:x:end\n";
    expect(replaceRegion(src, "f", "x", "a\nb")).toBe("# wa:x:start\na\nb\n# wa:x:end\n");
  });

  it.each([
    ["brak end", "// wa:x:start\n"],
    ["podwójny start", "// wa:x:start\n// wa:x:start\n// wa:x:end\n"],
    ["end przed start", "// wa:x:end\n// wa:x:start\n"],
    ["brak regionu", "nic\n"],
  ])("%s → błąd z nazwą pliku", (_, src) => {
    expect(() => replaceRegion(src, ".env.example", "x", "")).toThrow(
      ".env.example: uszkodzony region wa:x",
    );
  });
});
