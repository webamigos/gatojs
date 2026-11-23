import { describe, expect, it } from "vitest";
import { gatoCreateCommand } from "../delegate.js";

describe("gatoCreateCommand", () => {
  it("runs the gato-cli bin with create, passthrough and the kit appended", () => {
    expect(
      gatoCreateCommand({
        nodePath: "/usr/bin/node",
        gatoBin: "/nm/gato-cli/dist/gato.mjs",
        kitDir: "/k",
        passthrough: ["app", "--yes"],
      }),
    ).toEqual({
      command: "/usr/bin/node",
      args: [
        "/nm/gato-cli/dist/gato.mjs",
        "create",
        "app",
        "--yes",
        "--kit",
        "/k",
      ],
    });
  });

  it("keeps passthrough order and appends --kit last", () => {
    expect(
      gatoCreateCommand({
        nodePath: "/opt/node/bin/node",
        gatoBin: "/x/gato.mjs",
        kitDir: "/tmp/x/kit",
        passthrough: [
          "--title",
          "Acme",
          "app",
          "--cli-source",
          "/t/gato-cli-0.2.0.tgz",
          "--no-install",
        ],
      }),
    ).toEqual({
      command: "/opt/node/bin/node",
      args: [
        "/x/gato.mjs",
        "create",
        "--title",
        "Acme",
        "app",
        "--cli-source",
        "/t/gato-cli-0.2.0.tgz",
        "--no-install",
        "--kit",
        "/tmp/x/kit",
      ],
    });
  });

  it("never runs the kit's own wa.mjs", () => {
    const { args } = gatoCreateCommand({
      nodePath: "/usr/bin/node",
      gatoBin: "/nm/gato-cli/dist/gato.mjs",
      kitDir: "/k",
      passthrough: ["app"],
    });
    expect(args.some((arg) => arg.includes("wa.mjs"))).toBe(false);
    expect(args.some((arg) => arg.includes(".wa/bin"))).toBe(false);
  });
});
