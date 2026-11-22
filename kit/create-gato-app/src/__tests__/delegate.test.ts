import { describe, expect, it } from "vitest";
import { waCreateCommand } from "../delegate.js";

describe("waCreateCommand", () => {
  it("runs wa.mjs create with passthrough and the kit appended", () => {
    expect(
      waCreateCommand({
        nodePath: "/usr/bin/node",
        kitDir: "/k",
        passthrough: ["app", "--yes"],
      }),
    ).toEqual({
      command: "/usr/bin/node",
      args: ["/k/.wa/bin/wa.mjs", "create", "app", "--yes", "--kit", "/k"],
    });
  });

  it("keeps passthrough order and appends --kit last", () => {
    expect(
      waCreateCommand({
        nodePath: "/opt/node/bin/node",
        kitDir: "/tmp/x/kit",
        passthrough: ["--title", "Acme", "app", "--no-install"],
      }),
    ).toEqual({
      command: "/opt/node/bin/node",
      args: [
        "/tmp/x/kit/.wa/bin/wa.mjs",
        "create",
        "--title",
        "Acme",
        "app",
        "--no-install",
        "--kit",
        "/tmp/x/kit",
      ],
    });
  });
});
