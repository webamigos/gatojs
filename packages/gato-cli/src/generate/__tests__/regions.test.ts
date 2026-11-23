import { describe, expect, it } from "vitest";
import { replaceRegion } from "../regions.js";

describe("replaceRegion", () => {
  it("zastępuje treść regionu", () => {
    const src = "a\n// wa:x:start\nold\n// wa:x:end\nb\n";
    expect(replaceRegion(src, "f.ts", "x", "new")).toBe(
      "a\n// wa:x:start\nnew\n// wa:x:end\nb\n",
    );
  });

  it("pusty body zostawia region pusty", () => {
    const src = "# wa:x:start\nold\n# wa:x:end\n";
    expect(replaceRegion(src, "f", "x", "")).toBe("# wa:x:start\n# wa:x:end\n");
  });

  it("zachowuje wielolinijkowy body", () => {
    const src = "# wa:x:start\n# wa:x:end\n";
    expect(replaceRegion(src, "f", "x", "a\nb")).toBe(
      "# wa:x:start\na\nb\n# wa:x:end\n",
    );
  });

  it.each([
    ["brak end", "// wa:x:start\n"],
    ["podwójny start", "// wa:x:start\n// wa:x:start\n// wa:x:end\n"],
    ["end przed start", "// wa:x:end\n// wa:x:start\n"],
    [
      "start i end w tej samej linii",
      "a\n/* wa:x:start */ old /* wa:x:end */\nb\n",
    ],
    ["brak regionu", "nic\n"],
  ])("%s → błąd z nazwą pliku", (_, src) => {
    expect(() => replaceRegion(src, ".env.example", "x", "")).toThrow(
      ".env.example: malformed region wa:x",
    );
  });

  it.each([
    ["znacznik start", "a\n# wa:x:start\nb"],
    ["znacznik end", "a\n# wa:x:end\nb"],
    ["znacznik end w środku linii", "KEY=1 /* wa:x:end */"],
    ["znacznik start w ostatniej linii", "a\nb # wa:x:start"],
  ])("body ze znacznikiem tego samego markera (%s) → błąd", (_, body) => {
    const src = "# wa:x:start\nold\n# wa:x:end\n";
    expect(() => replaceRegion(src, ".env.example", "x", body)).toThrow(
      ".env.example: content of region wa:x contains a region marker",
    );
  });

  it("body ze znacznikiem innego markera jest dozwolony", () => {
    const src = "# wa:modules:start\nold\n# wa:modules:end\n";
    expect(
      replaceRegion(src, "f", "modules", "A=1\n# wa:services:end\nB=2"),
    ).toBe(
      "# wa:modules:start\nA=1\n# wa:services:end\nB=2\n# wa:modules:end\n",
    );
  });

  it("treść z CRLF → wynik wyłącznie z CRLF, także w liniach body", () => {
    const src = "A=1\r\n# wa:m:start\r\nold\r\n# wa:m:end\r\nB=2\r\n";
    expect(replaceRegion(src, "f", "m", "X=1\nY=2")).toBe(
      "A=1\r\n# wa:m:start\r\nX=1\r\nY=2\r\n# wa:m:end\r\nB=2\r\n",
    );
  });

  it("treść z CRLF i pusty body → region pusty z CRLF", () => {
    const src = "# wa:m:start\r\nold\r\n# wa:m:end\r\n";
    expect(replaceRegion(src, "f", "m", "")).toBe(
      "# wa:m:start\r\n# wa:m:end\r\n",
    );
  });

  it("treść z CRLF → w wyniku nie ma samotnego LF", () => {
    const src = "a\r\n// wa:m:start\r\n// wa:m:end\r\nb\r\n";
    expect(replaceRegion(src, "f", "m", "x\ny\nz")).not.toMatch(/(?<!\r)\n/);
  });

  it("body z CRLF w treści CRLF → ten sam wynik co body z LF", () => {
    const src = "A=1\r\n# wa:m:start\r\nold\r\n# wa:m:end\r\nB=2\r\n";
    expect(replaceRegion(src, "f", "m", "X=1\r\nY=2")).toBe(
      "A=1\r\n# wa:m:start\r\nX=1\r\nY=2\r\n# wa:m:end\r\nB=2\r\n",
    );
  });

  it("body z CRLF w treści LF → wynik wyłącznie z LF", () => {
    const src = "# wa:m:start\n# wa:m:end\n";
    expect(replaceRegion(src, "f", "m", "X=1\r\nY=2")).toBe(
      "# wa:m:start\nX=1\nY=2\n# wa:m:end\n",
    );
  });

  it("body z końcowym samotnym CR w treści CRLF → brak CR przed EOL", () => {
    const src = "# wa:m:start\r\n# wa:m:end\r\n";
    const result = replaceRegion(src, "f", "m", "a:\r\n  b: 1\r");
    expect(result).not.toContain("\r\r");
    expect(result).toBe("# wa:m:start\r\na:\r\n  b: 1\r\n# wa:m:end\r\n");
  });

  it("body z końcowym samotnym CR w treści LF → brak CR w wyniku", () => {
    const src = "# wa:m:start\n# wa:m:end\n";
    const result = replaceRegion(src, "f", "m", "a:\r\n  b: 1\r");
    expect(result).not.toContain("\r");
    expect(result).toBe("# wa:m:start\na:\n  b: 1\n# wa:m:end\n");
  });

  it("treść z mieszanymi końcami → region zastąpiony w całości, jednolity CRLF", () => {
    const src = "a\n# wa:m:start\r\nold\n# wa:m:end\n";
    const result = replaceRegion(src, "f", "m", "X=1");
    expect(result).not.toContain("old");
    expect(result).not.toMatch(/(?<!\r)\n/);
    expect(result).toBe("a\r\n# wa:m:start\r\nX=1\r\n# wa:m:end\r\n");
  });
  it("jeden start i dwa end → błąd uszkodzonego regionu", () => {
    const src = "# wa:modules:start\nold\n# wa:modules:end\n# wa:modules:end\n";
    expect(() => replaceRegion(src, "f", "modules", "x")).toThrow(
      "malformed region wa:modules",
    );
  });

  it("samotny CR w środku linii body zostaje w wyniku", () => {
    const src = "# wa:m:start\n# wa:m:end\n";
    expect(replaceRegion(src, "f", "m", "a\rb")).toBe(
      "# wa:m:start\na\rb\n# wa:m:end\n",
    );
  });
});
