import { join } from "node:path";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  cliDependency,
  createKitDir,
  kitSourceFromEnv,
  runMetaCommand,
  usage,
} from "../cli.js";

const gato = { name: "gato", version: "1.2.3" } as const;
const wa = { name: "wa", version: "1.2.3" } as const;

function linesOf(text: string): string[] {
  return text.split("\n");
}

describe("usage", () => {
  it("first line names the gato command", () => {
    expect(linesOf(usage("gato"))[0]).toBe("Usage: gato <command> [options]");
  });

  it("first line names the wa command", () => {
    expect(linesOf(usage("wa"))[0]).toBe("Usage: wa <command> [options]");
  });

  it.each([
    "  gato create <dir>",
    "  gato add <module>",
    "  gato remove <module>",
    "  gato list",
    "  gato generate",
    "  gato kit sync",
    "  gato help",
    "  gato version",
  ])("gato usage lists a line starting with %s", (prefix) => {
    expect(linesOf(usage("gato")).some((line) => line.startsWith(prefix))).toBe(
      true,
    );
  });

  it.each([
    "  wa create <dir>",
    "  wa add <module>",
    "  wa remove <module>",
    "  wa list",
    "  wa generate",
    "  wa kit sync",
    "  wa help",
    "  wa version",
  ])("wa usage lists a line starting with %s", (prefix) => {
    expect(linesOf(usage("wa")).some((line) => line.startsWith(prefix))).toBe(
      true,
    );
  });

  it("gato usage has no command line for wa", () => {
    expect(
      linesOf(usage("gato")).filter((line) => line.startsWith("  wa ")),
    ).toEqual([]);
  });

  it("wa usage has no command line for gato", () => {
    expect(
      linesOf(usage("wa")).filter((line) => line.startsWith("  gato ")),
    ).toEqual([]);
  });

  it.each(["gato", "wa"] as const)(
    "%s usage mentions GATO_KIT_SOURCE and WA_KIT_SOURCE",
    (name) => {
      expect(usage(name)).toContain("GATO_KIT_SOURCE");
      expect(usage(name)).toContain("WA_KIT_SOURCE");
    },
  );
});

describe("runMetaCommand", () => {
  it("empty argv prints usage to stderr and exits 1", () => {
    const outcome = runMetaCommand([], gato);
    expect(outcome).toEqual({
      exitCode: 1,
      stdout: null,
      stderr: usage("gato"),
    });
    expect(outcome?.stderr?.startsWith("Usage: gato <command> [options]")).toBe(
      true,
    );
  });

  it("empty argv for wa prints wa usage", () => {
    const outcome = runMetaCommand([], wa);
    expect(outcome?.exitCode).toBe(1);
    expect(outcome?.stderr?.startsWith("Usage: wa <command> [options]")).toBe(
      true,
    );
  });

  it.each([["help"], ["--help"], ["-h"]])(
    "%s prints gato usage to stdout and exits 0",
    (arg) => {
      const outcome = runMetaCommand([arg], gato);
      expect(outcome).toEqual({
        exitCode: 0,
        stdout: usage("gato"),
        stderr: null,
      });
      expect(
        outcome?.stdout?.startsWith("Usage: gato <command> [options]"),
      ).toBe(true);
    },
  );

  it.each([["help"], ["--help"], ["-h"]])(
    "%s for wa prints wa usage to stdout",
    (arg) => {
      const outcome = runMetaCommand([arg], wa);
      expect(outcome?.exitCode).toBe(0);
      expect(outcome?.stderr).toBeNull();
      expect(outcome?.stdout?.startsWith("Usage: wa <command> [options]")).toBe(
        true,
      );
    },
  );

  it.each([["version"], ["--version"], ["-v"]])(
    "%s prints the identity version and exits 0",
    (arg) => {
      expect(runMetaCommand([arg], gato)).toEqual({
        exitCode: 0,
        stdout: "1.2.3",
        stderr: null,
      });
    },
  );

  it.each([["version"], ["--version"], ["-v"]])(
    "%s prints another identity version verbatim",
    (arg) => {
      expect(runMetaCommand([arg], { name: "wa", version: "0.1.0" })).toEqual({
        exitCode: 0,
        stdout: "0.1.0",
        stderr: null,
      });
    },
  );

  it.each([
    [["create", "app"]],
    [["add", "m"]],
    [["remove", "m"]],
    [["list"]],
    [["generate"]],
    [["kit", "sync"]],
  ])("known command %j is left to the caller", (argv) => {
    expect(runMetaCommand(argv, gato)).toBeNull();
    expect(runMetaCommand(argv, wa)).toBeNull();
  });

  it("unknown command prints error and usage to stderr and exits 1", () => {
    const outcome = runMetaCommand(["nope"], gato);
    expect(outcome).toEqual({
      exitCode: 1,
      stdout: null,
      stderr: "Unknown command: nope\n\n" + usage("gato"),
    });
    expect(
      outcome?.stderr?.startsWith(
        "Unknown command: nope\n\nUsage: gato <command> [options]",
      ),
    ).toBe(true);
  });

  it("unknown command for wa appends wa usage", () => {
    const outcome = runMetaCommand(["nope"], wa);
    expect(outcome?.exitCode).toBe(1);
    expect(outcome?.stdout).toBeNull();
    expect(
      outcome?.stderr?.startsWith(
        "Unknown command: nope\n\nUsage: wa <command> [options]",
      ),
    ).toBe(true);
  });

  it("kit without a subcommand is unknown", () => {
    const outcome = runMetaCommand(["kit"], gato);
    expect(outcome?.exitCode).toBe(1);
    expect(outcome?.stdout).toBeNull();
    expect(outcome?.stderr?.startsWith("Unknown command: kit\n\n")).toBe(true);
  });

  it("kit with an unknown subcommand is unknown", () => {
    const outcome = runMetaCommand(["kit", "nope"], gato);
    expect(outcome?.exitCode).toBe(1);
    expect(outcome?.stdout).toBeNull();
    expect(outcome?.stderr?.startsWith("Unknown command: kit nope\n\n")).toBe(
      true,
    );
  });

  it("unknown command message names only the command word, not extra arguments", () => {
    const outcome = runMetaCommand(["nope", "extra"], gato);
    expect(outcome?.exitCode).toBe(1);
    expect(outcome?.stdout).toBeNull();
    expect(outcome?.stderr?.startsWith("Unknown command: nope\n\n")).toBe(true);
  });

  it("unknown kit subcommand message names kit and the subcommand, not extra arguments", () => {
    const outcome = runMetaCommand(["kit", "nope", "extra"], gato);
    expect(outcome?.exitCode).toBe(1);
    expect(outcome?.stdout).toBeNull();
    expect(outcome?.stderr?.startsWith("Unknown command: kit nope\n\n")).toBe(
      true,
    );
  });

  it("help flag after an unknown command does not turn it into help", () => {
    const outcome = runMetaCommand(["nope", "--help"], gato);
    expect(outcome?.exitCode).toBe(1);
    expect(outcome?.stdout).toBeNull();
    expect(outcome?.stderr?.startsWith("Unknown command: nope")).toBe(true);
  });

  it("help as the first argument wins over a following unknown word", () => {
    expect(runMetaCommand(["--help", "nope"], gato)).toEqual({
      exitCode: 0,
      stdout: usage("gato"),
      stderr: null,
    });
  });
});

describe("kitSourceFromEnv", () => {
  it("GATO_KIT_SOURCE wins over WA_KIT_SOURCE", () => {
    expect(
      kitSourceFromEnv({ GATO_KIT_SOURCE: "/a", WA_KIT_SOURCE: "/b" }),
    ).toBe("/a");
  });

  it("WA_KIT_SOURCE alone is used", () => {
    expect(kitSourceFromEnv({ WA_KIT_SOURCE: "/b" })).toBe("/b");
  });

  it("GATO_KIT_SOURCE alone is used", () => {
    expect(kitSourceFromEnv({ GATO_KIT_SOURCE: "/a" })).toBe("/a");
  });

  it("empty GATO_KIT_SOURCE falls back to WA_KIT_SOURCE", () => {
    expect(kitSourceFromEnv({ GATO_KIT_SOURCE: "", WA_KIT_SOURCE: "/b" })).toBe(
      "/b",
    );
  });

  it("no variables give undefined", () => {
    expect(kitSourceFromEnv({})).toBeUndefined();
  });

  it("both empty give undefined, not an empty string", () => {
    expect(
      kitSourceFromEnv({ GATO_KIT_SOURCE: "", WA_KIT_SOURCE: "" }),
    ).toBeUndefined();
  });

  it("unrelated keys are ignored", () => {
    expect(kitSourceFromEnv({ KIT_SOURCE: "/x" })).toBeUndefined();
  });

  test.prop([
    fc.string({ minLength: 1 }),
    fc.option(fc.string(), { nil: undefined }),
  ])(
    "a non-empty GATO_KIT_SOURCE is always returned verbatim",
    (gatoSource, waSource) => {
      expect(
        kitSourceFromEnv({
          GATO_KIT_SOURCE: gatoSource,
          WA_KIT_SOURCE: waSource,
        }),
      ).toBe(gatoSource);
    },
  );

  test.prop([
    fc.constantFrom<string | undefined>("", undefined),
    fc.string({ minLength: 1 }),
  ])(
    "an empty or missing GATO_KIT_SOURCE yields a non-empty WA_KIT_SOURCE",
    (gatoSource, waSource) => {
      expect(
        kitSourceFromEnv({
          GATO_KIT_SOURCE: gatoSource,
          WA_KIT_SOURCE: waSource,
        }),
      ).toBe(waSource);
    },
  );
});

describe("createKitDir", () => {
  it("absolute --kit is used for gato", () => {
    expect(
      createKitDir({
        kitFlag: "/tmp/kit",
        name: "gato",
        bundleDir: "/x/.wa/bin",
      }),
    ).toBe("/tmp/kit");
  });

  it("absolute --kit wins over the bundle location for wa", () => {
    expect(
      createKitDir({
        kitFlag: "/tmp/kit",
        name: "wa",
        bundleDir: "/x/.wa/bin",
      }),
    ).toBe("/tmp/kit");
  });

  it.each(["gato", "wa"] as const)(
    "relative --kit is resolved against the working directory for %s",
    (name) => {
      expect(
        createKitDir({ kitFlag: "some/kit", name, bundleDir: "/x/.wa/bin" }),
      ).toBe(join(process.cwd(), "some/kit"));
    },
  );

  it("without --kit wa uses the checkout two levels above the bundle", () => {
    expect(
      createKitDir({ kitFlag: null, name: "wa", bundleDir: "/repo/.wa/bin" }),
    ).toBe("/repo");
  });

  it.each(["/repo/.wa/bin", "/usr/lib/node_modules/gato-cli/dist"])(
    "without --kit gato refuses to guess from bundle dir %s",
    (bundleDir) => {
      expect(() =>
        createKitDir({ kitFlag: null, name: "gato", bundleDir }),
      ).toThrow(/^gato create needs --kit <path to a GatoJS checkout>$/);
    },
  );
});

describe("cliDependency", () => {
  it("gato without a source depends on the caret of its own version", () => {
    expect(
      cliDependency({
        name: "gato",
        version: "0.2.0",
        cliSource: null,
        cwd: "/w",
      }),
    ).toBe("^0.2.0");
  });

  it("gato uses its own version, not a fixed one", () => {
    expect(
      cliDependency({
        name: "gato",
        version: "1.10.3",
        cliSource: null,
        cwd: "/w",
      }),
    ).toBe("^1.10.3");
  });

  it("a relative source is resolved against cwd and prefixed with file:", () => {
    expect(
      cliDependency({
        name: "gato",
        version: "0.2.0",
        cliSource: "pack/gato-cli-0.2.0.tgz",
        cwd: "/w",
      }),
    ).toBe("file:/w/pack/gato-cli-0.2.0.tgz");
  });

  it("a relative source with .. is normalised against cwd", () => {
    expect(
      cliDependency({
        name: "gato",
        version: "0.2.0",
        cliSource: "../pack/x.tgz",
        cwd: "/w/app",
      }),
    ).toBe("file:/w/pack/x.tgz");
  });

  it("an absolute source is kept and prefixed with file:", () => {
    expect(
      cliDependency({
        name: "gato",
        version: "0.2.0",
        cliSource: "/abs/x.tgz",
        cwd: "/w",
      }),
    ).toBe("file:/abs/x.tgz");
  });

  it("wa without a source adds no dependency", () => {
    expect(
      cliDependency({
        name: "wa",
        version: "0.2.0",
        cliSource: null,
        cwd: "/w",
      }),
    ).toBeNull();
  });

  it("wa with a source depends on the resolved file", () => {
    expect(
      cliDependency({
        name: "wa",
        version: "0.2.0",
        cliSource: "x.tgz",
        cwd: "/w",
      }),
    ).toBe("file:/w/x.tgz");
  });

  it("wa with an absolute source depends on that file", () => {
    expect(
      cliDependency({
        name: "wa",
        version: "0.2.0",
        cliSource: "/t/gato-cli-0.2.0.tgz",
        cwd: "/w",
      }),
    ).toBe("file:/t/gato-cli-0.2.0.tgz");
  });

  const segment = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,7}$/);

  test.prop([
    fc.constantFrom("gato" as const, "wa" as const),
    fc.array(segment, { minLength: 1, maxLength: 4 }),
  ])("any absolute normalised source becomes file:<source>", (name, parts) => {
    const source = `/${parts.join("/")}.tgz`;
    expect(
      cliDependency({ name, version: "0.2.0", cliSource: source, cwd: "/w" }),
    ).toBe(`file:${source}`);
  });
});
