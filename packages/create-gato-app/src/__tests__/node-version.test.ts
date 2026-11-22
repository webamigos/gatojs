import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  checkNodeVersion,
  enginesRange,
  parseNodeVersion,
  SUPPORTED_NODE_RANGES,
} from "../node-version.js";

const CLOSED_22_TO_25 = [{ from: "22.0.0", belowMajor: 25 }];
const WITH_GAP = [{ from: "24.15.0", belowMajor: 25 }, { from: "26.0.0" }];

describe("enginesRange", () => {
  it("default ranges give >=22", () => {
    expect(enginesRange(SUPPORTED_NODE_RANGES)).toBe(">=22");
  });

  it("matches engines.node in package.json", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { engines: { node: string } };
    expect(packageJson.engines.node).toBe(">=22");
    expect(enginesRange(SUPPORTED_NODE_RANGES)).toBe(packageJson.engines.node);
  });

  it("closed and open ranges are joined with ||, the open one as a bare major", () => {
    expect(enginesRange(WITH_GAP)).toBe("^24.15.0 || >=26");
  });

  it("a closed range keeps its full version even when it ends in .0.0", () => {
    expect(enginesRange(CLOSED_22_TO_25)).toBe("^22.0.0");
  });

  it.each([
    ["22.1.0", ">=22.1.0"],
    ["22.0.1", ">=22.0.1"],
    ["22.10.0", ">=22.10.0"],
    ["20.10.0", ">=20.10.0"],
    ["100.0.0", ">=100"],
  ])("an open range from %s prints as %s", (from, expected) => {
    expect(enginesRange([{ from }])).toBe(expected);
  });

  it("two closed ranges both keep the full form", () => {
    expect(
      enginesRange([
        { from: "22.0.0", belowMajor: 23 },
        { from: "24.0.0", belowMajor: 25 },
      ]),
    ).toBe("^22.0.0 || ^24.0.0");
  });
});

describe("parseNodeVersion", () => {
  it("parses a release version", () => {
    expect(parseNodeVersion("v22.11.0")).toEqual({
      major: 22,
      minor: 11,
      patch: 0,
    });
    expect(parseNodeVersion("v22.11.0")?.prerelease).toBeUndefined();
  });

  it("parses a prerelease version", () => {
    expect(parseNodeVersion("v24.0.0-nightly2026")).toEqual({
      major: 24,
      minor: 0,
      patch: 0,
      prerelease: "nightly2026",
    });
  });

  it.each(["22", "v22.1", "banana", "xv22.0.0", "v22.0.0abc"])(
    "%s is not a version",
    (value) => {
      expect(parseNodeVersion(value)).toBeUndefined();
    },
  );
});

describe("checkNodeVersion with default ranges", () => {
  it.each(["v22.0.0", "v22.11.0", "v24.15.0", "v26.1.0"])(
    "%s is supported",
    (version) => {
      expect(checkNodeVersion({ version, willInstall: true })).toEqual({
        kind: "ok",
      });
    },
  );

  it.each([
    ["v21.7.3", "21.7.3"],
    ["v20.18.0", "20.18.0"],
    ["v18.0.0", "18.0.0"],
    ["v21.99.99", "21.99.99"],
  ])("%s is refused as too old", (version, bare) => {
    const verdict = checkNodeVersion({ version, willInstall: true });
    expect(verdict.kind).toBe("refuse");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("too old");
    expect(verdict.message).toContain(">=22");
    expect(verdict.message).not.toContain(">=22.0.0");
    expect(verdict.message).toContain(bare);
    expect(verdict.message).not.toContain("too new");
    expect(verdict.message).not.toContain("unsupported release line");
  });

  it("a prerelease of the minimum release is refused", () => {
    const verdict = checkNodeVersion({
      version: "v22.0.0-rc.1",
      willInstall: true,
    });
    expect(verdict.kind).toBe("refuse");
  });

  it("refusal tells how to install a supported Node and how to skip install", () => {
    const verdict = checkNodeVersion({ version: "v20.0.0", willInstall: true });
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("nvm install 22");
    expect(verdict.message).toContain("--skip-install");
  });

  it("an unparseable version never blocks", () => {
    expect(checkNodeVersion({ version: "banana", willInstall: true })).toEqual({
      kind: "ok",
    });
  });
});

describe("checkNodeVersion at a patch boundary", () => {
  const PATCH_RANGE = [{ from: "22.11.2" }];

  it("v22.11.1 is refused as too old", () => {
    const verdict = checkNodeVersion({
      version: "v22.11.1",
      willInstall: true,
      ranges: PATCH_RANGE,
    });
    expect(verdict.kind).toBe("refuse");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("too old");
  });

  it("v22.11.2 is supported", () => {
    expect(
      checkNodeVersion({
        version: "v22.11.2",
        willInstall: true,
        ranges: PATCH_RANGE,
      }),
    ).toEqual({ kind: "ok" });
  });
});

describe("checkNodeVersion prerelease refusal message", () => {
  it("contains the full prerelease version", () => {
    const verdict = checkNodeVersion({
      version: "v22.0.0-rc.1",
      willInstall: true,
    });
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("22.0.0-rc.1");
  });
});

describe("checkNodeVersion with a closed range", () => {
  it.each(["v25.0.0", "v26.2.0"])("%s is refused as too new", (version) => {
    const verdict = checkNodeVersion({
      version,
      willInstall: true,
      ranges: CLOSED_22_TO_25,
    });
    expect(verdict.kind).toBe("refuse");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("too new");
    expect(verdict.message).not.toContain("too old");
    expect(verdict.message).not.toContain("unsupported release line");
  });

  it.each(["v24.9.9", "v22.0.0", "v24.99.99"])("%s is supported", (version) => {
    expect(
      checkNodeVersion({ version, willInstall: true, ranges: CLOSED_22_TO_25 }),
    ).toEqual({ kind: "ok" });
  });

  it("v21.9.9 is refused as too old", () => {
    const verdict = checkNodeVersion({
      version: "v21.9.9",
      willInstall: true,
      ranges: CLOSED_22_TO_25,
    });
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.kind).toBe("refuse");
    expect(verdict.message).toContain("too old");
  });
});

describe("checkNodeVersion with a gap between ranges", () => {
  it("v25.3.0 falls into an unsupported release line", () => {
    const verdict = checkNodeVersion({
      version: "v25.3.0",
      willInstall: true,
      ranges: WITH_GAP,
    });
    expect(verdict.kind).toBe("refuse");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("unsupported release line");
    expect(verdict.message).not.toContain("too old");
    expect(verdict.message).not.toContain("too new");
  });

  it("v25.0.0 falls into an unsupported release line", () => {
    const verdict = checkNodeVersion({
      version: "v25.0.0",
      willInstall: true,
      ranges: WITH_GAP,
    });
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("unsupported release line");
  });

  it.each(["v24.14.0", "v24.14.99"])("%s is too old", (version) => {
    const verdict = checkNodeVersion({
      version,
      willInstall: true,
      ranges: WITH_GAP,
    });
    expect(verdict.kind).toBe("refuse");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("too old");
    expect(verdict.message).not.toContain("unsupported release line");
  });

  it.each(["v24.15.0", "v24.16.0", "v26.0.0", "v27.1.0"])(
    "%s is supported",
    (version) => {
      expect(
        checkNodeVersion({ version, willInstall: true, ranges: WITH_GAP }),
      ).toEqual({ kind: "ok" });
    },
  );

  it("v26.0.0-rc.1 is not treated as v26.0.0", () => {
    const verdict = checkNodeVersion({
      version: "v26.0.0-rc.1",
      willInstall: true,
      ranges: WITH_GAP,
    });
    expect(verdict.kind).toBe("refuse");
  });

  it("refusal suggests the first range's major", () => {
    const verdict = checkNodeVersion({
      version: "v20.0.0",
      willInstall: true,
      ranges: WITH_GAP,
    });
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("nvm install 24");
  });
});

describe("checkNodeVersion without install", () => {
  it("an unsupported version only warns", () => {
    const verdict = checkNodeVersion({
      version: "v21.7.3",
      willInstall: false,
    });
    expect(verdict.kind).toBe("warn");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("too old");
    expect(verdict.message).toContain("npm install");
  });

  it("a too new version only warns with the same headline", () => {
    const verdict = checkNodeVersion({
      version: "v25.0.0",
      willInstall: false,
      ranges: CLOSED_22_TO_25,
    });
    expect(verdict.kind).toBe("warn");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("too new");
  });

  it("a supported version is ok", () => {
    expect(
      checkNodeVersion({ version: "v22.11.0", willInstall: false }),
    ).toEqual({ kind: "ok" });
  });
});
