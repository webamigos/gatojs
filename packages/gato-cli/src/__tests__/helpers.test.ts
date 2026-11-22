import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProjectFromTag,
  makeTaggedKit,
  removeTempDirs,
} from "./helpers.js";

const run = promisify(execFile);

afterEach(async () => {
  await removeTempDirs();
});

describe("fikstura dwóch wersji kitu", () => {
  it("makeTaggedKit tworzy tagi v0.1.0 i v0.2.0, a drzewo robocze jest na v0.2.0", async () => {
    const tagged = await makeTaggedKit(async (dir) => {
      await writeFile(
        join(dir, "src/i18n/config.ts"),
        "export const v2 = true;\n",
      );
    });

    const { stdout: tags } = await run("git", ["-C", tagged, "tag"]);
    expect(tags.split("\n").filter(Boolean)).toEqual(["v0.1.0", "v0.2.0"]);
    const { stdout: oldConfig } = await run("git", [
      "-C",
      tagged,
      "show",
      "v0.1.0:src/i18n/config.ts",
    ]);
    expect(oldConfig).not.toBe("export const v2 = true;\n");
    expect(
      JSON.parse(await readFile(join(tagged, "kit/kit.json"), "utf8")).version,
    ).toBe("0.2.0");
    const { stdout: status } = await run("git", [
      "-C",
      tagged,
      "status",
      "--porcelain",
    ]);
    expect(status).toBe("");
  });

  it("createProjectFromTag tworzy projekt z v0.1.0 z czystym drzewem git", async () => {
    const tagged = await makeTaggedKit(async () => {});

    const project = await createProjectFromTag(tagged, "my-app", ["demo"]);

    const { stdout: status } = await run("git", [
      "-C",
      project,
      "status",
      "--porcelain",
    ]);
    expect(status).toBe("");
    const state = JSON.parse(
      await readFile(join(project, ".wa/kit.json"), "utf8"),
    );
    expect(state.kitVersion).toBe("0.1.0");
    expect(Object.keys(state.modules).sort()).toEqual(["core", "demo"]);
  });
});
