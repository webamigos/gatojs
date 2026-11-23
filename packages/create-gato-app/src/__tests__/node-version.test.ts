import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  checkNodeVersion,
  enginesRange,
  parseEnginesRange,
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
    expect(parseNodeVersion("v22.11.0")).toStrictEqual({
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

  it("v21.7.3 refusal starts with the exact too old headline", () => {
    const verdict = checkNodeVersion({ version: "v21.7.3", willInstall: true });
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message.split("\n")[0]).toBe(
      "Node 21.7.3 is too old: GatoJS needs Node >=22.",
    );
  });

  it("a range start that is not x.y.z throws", () => {
    expect(() =>
      checkNodeVersion({
        version: "v20.0.0",
        willInstall: true,
        ranges: [{ from: "22" }],
      }),
    ).toThrow("Invalid Node range start: 22");
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
  it("v25.3.0 falls into an unsupported odd-numbered release line", () => {
    const verdict = checkNodeVersion({
      version: "v25.3.0",
      willInstall: true,
      ranges: WITH_GAP,
    });
    expect(verdict.kind).toBe("refuse");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("unsupported odd-numbered release line");
    expect(verdict.message).not.toContain("too old");
    expect(verdict.message).not.toContain("too new");
  });

  it("v23.1.0 between two closed ranges is an unsupported odd-numbered release line, not too new", () => {
    const verdict = checkNodeVersion({
      version: "v23.1.0",
      willInstall: true,
      ranges: [
        { from: "22.0.0", belowMajor: 23 },
        { from: "24.0.0", belowMajor: 25 },
      ],
    });
    expect(verdict.kind).toBe("refuse");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("unsupported odd-numbered release line");
    expect(verdict.message).not.toContain("too new");
  });

  it("v25.0.0 falls into an unsupported odd-numbered release line", () => {
    const verdict = checkNodeVersion({
      version: "v25.0.0",
      willInstall: true,
      ranges: WITH_GAP,
    });
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message).toContain("unsupported odd-numbered release line");
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

describe("parseEnginesRange", () => {
  it.each([
    [">=22", [{ from: "22.0.0" }]],
    [">= 22.12", [{ from: "22.12.0" }]],
    [">=22.12.1", [{ from: "22.12.1" }]],
    ["^22", [{ from: "22.0.0", belowMajor: 23 }]],
    ["^22.12.0", [{ from: "22.12.0", belowMajor: 23 }]],
    [
      "^24.0.0 || ^22.12.0",
      [
        { from: "22.12.0", belowMajor: 23 },
        { from: "24.0.0", belowMajor: 25 },
      ],
    ],
    [
      "^22.12.0 || ^24.0.0 || ^26.0.0",
      [
        { from: "22.12.0", belowMajor: 23 },
        { from: "24.0.0", belowMajor: 25 },
        { from: "26.0.0", belowMajor: 27 },
      ],
    ],
    [
      ">=26 || ^22.12.0",
      [{ from: "22.12.0", belowMajor: 23 }, { from: "26.0.0" }],
    ],
  ])("%j daje %j", (range, expected) => {
    expect(parseEnginesRange(range)).toEqual(expected);
  });

  it.each(["22.x", "~22.1.0", "*", "", "^22 ||", "|| ^22", ">=", "^", "22", "<24", ">=22 <24", "^22.x"])(
    "%j nie jest zakresem, który kreator rozumie",
    (range) => {
      expect(parseEnginesRange(range)).toBeNull();
    },
  );
});

const KIT_RANGES = [
  { from: "22.12.0", belowMajor: 23 },
  { from: "24.0.0", belowMajor: 25 },
  { from: "26.0.0", belowMajor: 27 },
];
const KIT_RANGE_TEXT = "^22.12.0 || ^24.0.0 || ^26.0.0";

function refusalOf(version: string, ranges = KIT_RANGES): string {
  const verdict = checkNodeVersion({ version, willInstall: true, ranges });
  if (verdict.kind !== "refuse") {
    throw new Error(`expected a refusal for ${version}, got ${verdict.kind}`);
  }
  return verdict.message;
}

describe("checkNodeVersion with the kit range ^22.12.0 || ^24.0.0 || ^26.0.0", () => {
  it.each(["20.11.0", "22.11.0", "22.11.99"])("v%s jest za stary", (version) => {
    expect(refusalOf(`v${version}`).split("\n")[0]).toBe(
      `Node ${version} is too old: GatoJS needs Node ${KIT_RANGE_TEXT}.`,
    );
  });

  it.each(["23.3.0", "25.1.0", "23.0.0"])("v%s to nieparzysta linia wydań", (version) => {
    expect(refusalOf(`v${version}`).split("\n")[0]).toBe(
      `Node ${version} is an unsupported odd-numbered release line: GatoJS supports Node ${KIT_RANGE_TEXT}.`,
    );
  });

  it("v27.0.0 jest za nowy, mimo że jest nieparzysty", () => {
    expect(refusalOf("v27.0.0").split("\n")[0]).toBe(
      `Node 27.0.0 is too new: GatoJS supports Node ${KIT_RANGE_TEXT}.`,
    );
  });

  it.each(["v22.12.0", "v22.99.0", "v24.15.0", "v24.0.0", "v26.1.0"])("%s jest obsługiwany", (version) => {
    expect(checkNodeVersion({ version, willInstall: true, ranges: KIT_RANGES })).toEqual({ kind: "ok" });
  });

  it("^22 nie przyjmuje Node 23", () => {
    const verdict = checkNodeVersion({
      version: "v23.0.0",
      willInstall: true,
      ranges: [{ from: "22.0.0", belowMajor: 23 }],
    });
    expect(verdict.kind).toBe("refuse");
  });

  it.each(["v20.11.0", "v23.3.0", "v27.0.0"])(
    "odmowa dla %s mówi, że create-gato-app instaluje zależności, i podpowiada nvm",
    (version) => {
      const message = refusalOf(version);
      expect(message).toContain(
        "Stopping before anything is downloaded: create-gato-app runs npm install under this Node.",
      );
      expect(message).toContain("nvm install 22");
      expect(message).toContain("--skip-install");
      expect(message).not.toContain("`gato create` runs npm install");
    },
  );

  it("parzysta linia między zakresami to nieobsługiwana linia wydań, nie nieparzysta", () => {
    const message = refusalOf("v22.1.0", [
      { from: "20.0.0", belowMajor: 21 },
      { from: "24.0.0", belowMajor: 25 },
    ]);
    expect(message.split("\n")[0]).toBe(
      "Node 22.1.0 is an unsupported release line: GatoJS supports Node ^20.0.0 || ^24.0.0.",
    );
  });

  it("bez instalacji za stary Node tylko ostrzega i wskazuje --skip-install", () => {
    const verdict = checkNodeVersion({ version: "v22.11.0", willInstall: false, ranges: KIT_RANGES });
    expect(verdict.kind).toBe("warn");
    if (verdict.kind === "ok") throw new Error("expected a message");
    expect(verdict.message.startsWith("Warning: Node 22.11.0 is too old")).toBe(true);
    expect(verdict.message).toContain("--skip-install");
  });

  it("bez instalacji nieparzysty Node też tylko ostrzega", () => {
    const verdict = checkNodeVersion({ version: "v25.1.0", willInstall: false, ranges: KIT_RANGES });
    expect(verdict.kind).toBe("warn");
  });
});
