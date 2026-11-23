import { describe, expect, it } from "vitest";
import { parseCliArgs, USAGE } from "../args.js";

describe("parseCliArgs", () => {
  it.each([[["--help"]], [["-h"]], [["my-app", "--help"]]])(
    "%j returns help",
    (argv) => {
      expect(parseCliArgs(argv)).toEqual({ kind: "help" });
    },
  );

  it.each([[["--version"]], [["-v"]]])("%j returns version", (argv) => {
    expect(parseCliArgs(argv)).toEqual({ kind: "version" });
  });

  it.each([
    [["--version", "--help"]],
    [["--help", "--version"]],
    [["-v", "-h"]],
  ])("%j prefers help over version", (argv) => {
    expect(parseCliArgs(argv)).toEqual({ kind: "help" });
  });

  it("a bare target gets defaults and is passed through", () => {
    expect(parseCliArgs(["my-app"])).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: null,
      kitPath: null,
      install: true,
      passthrough: ["my-app"],
    });
  });

  it.each([
    [["my-app", "--kit-version", "0.1.0"]],
    [["my-app", "--kit-version=0.1.0"]],
    [["--kit-version", "0.1.0", "my-app"]],
  ])("%j sets kitVersion and keeps the flag out of passthrough", (argv) => {
    expect(parseCliArgs(argv)).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: "0.1.0",
      kitPath: null,
      install: true,
      passthrough: ["my-app"],
    });
  });

  it.each([
    [["my-app", "--kit-version", "v0.2.3"]],
    [["my-app", "--kit-version=v0.2.3"]],
  ])("%j strips the v prefix from kitVersion", (argv) => {
    expect(parseCliArgs(argv)).toMatchObject({
      kind: "create",
      kitVersion: "0.2.3",
      passthrough: ["my-app"],
    });
  });

  it.each(["1.0", "latest", "1.0.0-rc.1", "01.0.0", "1.0.0.1", "v1.0"])(
    "--kit-version %s is rejected as not x.y.z",
    (value) => {
      expect(() => parseCliArgs(["my-app", "--kit-version", value])).toThrow(
        `--kit-version: expected x.y.z, got "${value}"`,
      );
    },
  );

  it.each([
    [["my-app", "--kit-version"]],
    [["my-app", "--kit-version", "--yes"]],
    [["my-app", "--kit-version="]],
  ])("%j reports a missing --kit-version value", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(
      "--kit-version needs a value, e.g. --kit-version 0.1.0",
    );
  });

  it.each([
    [["my-app", "--kit", "../gatojs"]],
    [["my-app", "--kit=../gatojs"]],
    [["--kit", "../gatojs", "my-app"]],
  ])("%j sets kitPath and never passes --kit through", (argv) => {
    expect(parseCliArgs(argv)).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: null,
      kitPath: "../gatojs",
      install: true,
      passthrough: ["my-app"],
    });
  });

  it("--kit with its value is removed from the middle of passthrough", () => {
    expect(
      parseCliArgs(["my-app", "--kit", "../gatojs", "--yes"]),
    ).toMatchObject({ passthrough: ["my-app", "--yes"] });
  });

  it("--kit-version with its value is removed from the middle of passthrough", () => {
    expect(
      parseCliArgs(["my-app", "--kit-version", "0.1.0", "--yes"]),
    ).toMatchObject({ passthrough: ["my-app", "--yes"] });
  });

  it.each([
    [["my-app", "--kit"]],
    [["my-app", "--kit="]],
    [["my-app", "--kit", "--yes"]],
  ])("%j reports a missing --kit path", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow("--kit needs a path");
  });

  it.each([
    [["my-app", "--kit", "../gatojs", "--kit-version", "0.1.0"]],
    [["my-app", "--kit-version=0.1.0", "--kit=../gatojs"]],
  ])("%j rejects --kit together with --kit-version", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(
      "--kit and --kit-version cannot be used together",
    );
  });

  it("--kit given twice is rejected", () => {
    expect(() =>
      parseCliArgs(["my-app", "--kit", "../a", "--kit", "../b"]),
    ).toThrow("--kit given more than once");
  });

  it("--kit-version given twice is rejected", () => {
    expect(() =>
      parseCliArgs(["my-app", "--kit-version", "0.1.0", "--kit-version=0.2.0"]),
    ).toThrow("--kit-version given more than once");
  });

  it("--skip-install becomes --no-install in passthrough", () => {
    expect(parseCliArgs(["my-app", "--skip-install"])).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: null,
      kitPath: null,
      install: false,
      passthrough: ["my-app", "--no-install"],
    });
  });

  it("--no-install disables install and is passed through", () => {
    expect(parseCliArgs(["my-app", "--no-install"])).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: null,
      kitPath: null,
      install: false,
      passthrough: ["my-app", "--no-install"],
    });
  });

  it.each([
    [["my-app", "--skip-install", "--no-install"]],
    [["my-app", "--no-install", "--skip-install"]],
  ])("%j passes --no-install exactly once", (argv) => {
    const result = parseCliArgs(argv);
    expect(result).toMatchObject({ kind: "create", install: false });
    if (result.kind !== "create") throw new Error("expected create");
    expect(result.passthrough.filter((arg) => arg === "--no-install")).toEqual([
      "--no-install",
    ]);
    expect(result.passthrough).not.toContain("--skip-install");
  });

  it("--skip-docker is not supported yet", () => {
    expect(() => parseCliArgs(["my-app", "--skip-docker"])).toThrow(
      "--skip-docker is not supported yet",
    );
  });

  it("gato create options are passed through unchanged and in order", () => {
    expect(
      parseCliArgs([
        "--yes",
        "my-app",
        "--modules",
        "uploads,api-keys",
        "--title",
        "Acme",
        "--no-git",
        "--setup",
      ]),
    ).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: null,
      kitPath: null,
      install: true,
      passthrough: [
        "--yes",
        "my-app",
        "--modules",
        "uploads,api-keys",
        "--title",
        "Acme",
        "--no-git",
        "--setup",
      ],
    });
  });

  it.each([
    [["--title", "Acme App", "my-app"]],
    [["--title=Acme", "my-app"]],
    [["--modules", "uploads", "my-app"]],
    [["--locales", "pl,en", "my-app"]],
    [["--admin-email", "a@b.pl", "my-app"]],
  ])("%j does not take an option value as the target", (argv) => {
    expect(parseCliArgs(argv)).toMatchObject({
      kind: "create",
      target: "my-app",
      passthrough: argv,
    });
  });

  it.each([
    [["--yes"]],
    [[]],
    [["--title", "Acme"]],
    [["--kit", "../gatojs"]],
    [["--kit-version", "0.1.0"]],
    [[""]],
    [["", "--yes"]],
  ])("%j rejects a missing project directory", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(/^Missing project directory/);
  });

  it("an empty target is a missing project directory", () => {
    expect(() => parseCliArgs([""])).toThrow(/^Missing project directory\./);
  });

  it.each(["1.2.3", "100.0.0"])(
    "--kit-version %s is kept as given",
    (value) => {
      expect(parseCliArgs(["my-app", "--kit-version", value])).toMatchObject({
        kind: "create",
        kitVersion: value,
        passthrough: ["my-app"],
      });
    },
  );

  it("a multi-digit --kit-version is kept whole", () => {
    expect(
      parseCliArgs(["my-app", "--kit-version", "10.20.300"]),
    ).toMatchObject({
      kind: "create",
      kitVersion: "10.20.300",
      passthrough: ["my-app"],
    });
  });

  it("a trailing gato create option without a value is passed through as is", () => {
    const result = parseCliArgs(["my-app", "--title"]);
    expect(result).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: null,
      kitPath: null,
      install: true,
      passthrough: ["my-app", "--title"],
    });
    if (result.kind !== "create") throw new Error("expected create");
    expect(result.passthrough).toHaveLength(2);
    expect(result.passthrough).not.toContain(undefined);
  });

  it("--cli-source before the target does not take its value as the target", () => {
    expect(parseCliArgs(["--cli-source", "/t/x.tgz", "my-app"])).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: null,
      kitPath: null,
      install: true,
      passthrough: ["--cli-source", "/t/x.tgz", "my-app"],
    });
  });

  it("--cli-source after the target is passed through with its value", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--cli-source",
        "pack/gato-cli-0.2.0.tgz",
        "--yes",
      ]),
    ).toMatchObject({
      kind: "create",
      target: "my-app",
      passthrough: [
        "my-app",
        "--cli-source",
        "pack/gato-cli-0.2.0.tgz",
        "--yes",
      ],
    });
  });

  it("--cli-source=<path> passes through as one token", () => {
    expect(parseCliArgs(["--cli-source=/t/x.tgz", "my-app"])).toMatchObject({
      kind: "create",
      target: "my-app",
      passthrough: ["--cli-source=/t/x.tgz", "my-app"],
    });
  });

  it.each([[["--cli-source", "/t/x.tgz"]], [["--cli-source", "my-app"]]])(
    "%j has no project directory: the value is not a target",
    (argv) => {
      expect(() => parseCliArgs(argv)).toThrow(/^Missing project directory/);
    },
  );

  it("--cli-source together with --kit keeps --kit out of passthrough", () => {
    expect(
      parseCliArgs([
        "my-app",
        "--kit",
        "../gatojs",
        "--cli-source",
        "/t/x.tgz",
      ]),
    ).toEqual({
      kind: "create",
      target: "my-app",
      kitVersion: null,
      kitPath: "../gatojs",
      install: true,
      passthrough: ["my-app", "--cli-source", "/t/x.tgz"],
    });
  });

  it("unknown flags pass through", () => {
    expect(parseCliArgs(["my-app", "--frobnicate"])).toMatchObject({
      kind: "create",
      target: "my-app",
      passthrough: ["my-app", "--frobnicate"],
    });
  });
});

describe("USAGE", () => {
  it("mentions the command and its own flags", () => {
    expect(USAGE).toContain("create-gato-app <dir>");
    expect(USAGE).toContain("--kit-version");
    expect(USAGE).toMatch(/--kit(?!-)/);
    expect(USAGE).toContain("--skip-install");
  });

  it("names gato create as the delegate and documents --cli-source", () => {
    expect(USAGE).toContain("gato create");
    expect(USAGE).toContain("--cli-source");
    expect(USAGE).not.toContain("wa create");
  });

  it("describes the token as a way around rate limits, not as private-repository access", () => {
    expect(USAGE.split("\n")).toContain(
      "Rate limits: set GITHUB_TOKEN or GH_TOKEN, or log in with `gh auth login`.",
    );
    expect(
      USAGE.split("\n").filter((line) => line.startsWith("Private repository")),
    ).toEqual([]);
  });
});
