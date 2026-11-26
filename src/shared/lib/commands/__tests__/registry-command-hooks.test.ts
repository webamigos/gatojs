import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { moduleCommandHooks, modules } from "@/modules.generated";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import { commandHookRegistry } from "../define-command";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
const hasUploadsModule = fs.existsSync(
  path.join(repoRoot, "src/features/uploads/module.ts"),
);

const registeredModules: readonly ModuleDef[] = modules;

describe("the generated registry and command hooks", () => {
  it("exports moduleCommandHooks as a list built without an error", () => {
    expect(Array.isArray(moduleCommandHooks)).toBe(true);
  });

  it("the commands declared by the real modules pass the registry validation", () => {
    expect(() =>
      commandHookRegistry({ modules: registeredModules, hooks: [] }, {}),
    ).not.toThrow();
  });

  it.skipIf(!hasUploadsModule)(
    "the uploads module declares uploads.delete in the real registry",
    () => {
      expect(
        registeredModules.find((moduleDef) => moduleDef.key === "uploads")
          ?.commands,
      ).toEqual(["uploads.delete"]);
    },
  );
});
