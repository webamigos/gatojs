// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OrgRole } from "@/shared/lib/auth/roles";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import { loadFeatureModules } from "../../../scripts/lib/architecture/gato-config-keys";
import { permissionKeyProblems } from "../../../scripts/lib/architecture/permission-keys";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function moduleWithPermissions(
  key: string,
  permissionKeys: string[],
): ModuleDef {
  return {
    key,
    nav: [],
    routePrefixes: [],
    permissions: Object.fromEntries(
      permissionKeys.map(
        (
          permissionKey,
        ): [string, { defaultRoles: OrgRole[]; labelKey: string }] => [
          permissionKey,
          { defaultRoles: ["owner"], labelKey: "permission" },
        ],
      ),
    ),
  };
}

describe("permissionKeyProblems", () => {
  it("accepts a key prefixed with the module key and a dot", () => {
    expect(
      permissionKeyProblems([
        moduleWithPermissions("uploads", ["uploads.delete-others"]),
      ]),
    ).toEqual([]);
  });

  it("accepts a key with more dots after the module prefix", () => {
    expect(
      permissionKeyProblems([
        moduleWithPermissions("uploads", ["uploads.files.delete"]),
      ]),
    ).toEqual([]);
  });

  it("accepts a module without permissions", () => {
    expect(
      permissionKeyProblems([{ key: "dashboard", nav: [], routePrefixes: [] }]),
    ).toEqual([]);
  });

  it("accepts a module with an empty permissions object", () => {
    expect(
      permissionKeyProblems([moduleWithPermissions("uploads", [])]),
    ).toEqual([]);
  });

  it("reports a key without the module prefix", () => {
    expect(
      permissionKeyProblems([
        moduleWithPermissions("uploads", ["delete-others"]),
      ]),
    ).toEqual([
      'uploads: permission key "delete-others" must start with "uploads."',
    ]);
  });

  it("reports a key with nothing after the dot", () => {
    expect(
      permissionKeyProblems([moduleWithPermissions("uploads", ["uploads."])]),
    ).toEqual([
      'uploads: permission key "uploads." must start with "uploads."',
    ]);
  });

  it("reports a key equal to the module key", () => {
    expect(
      permissionKeyProblems([moduleWithPermissions("uploads", ["uploads"])]),
    ).toEqual(['uploads: permission key "uploads" must start with "uploads."']);
  });

  it("reports a key whose prefix only starts with the module key", () => {
    expect(
      permissionKeyProblems([moduleWithPermissions("uploads", ["uploadsx.y"])]),
    ).toEqual([
      'uploads: permission key "uploadsx.y" must start with "uploads."',
    ]);
  });

  it("reports a key in another module's namespace", () => {
    expect(
      permissionKeyProblems([
        moduleWithPermissions("uploads", ["invoices.delete"]),
        moduleWithPermissions("invoices", ["invoices.delete"]),
      ]),
    ).toEqual([
      'uploads: permission key "invoices.delete" must start with "uploads."',
    ]);
  });

  it("checks against the whole hyphenated module key", () => {
    expect(
      permissionKeyProblems([
        moduleWithPermissions("api-keys", ["api.create", "api-keys.create"]),
      ]),
    ).toEqual([
      'api-keys: permission key "api.create" must start with "api-keys."',
    ]);
  });

  it("reports in module order, then in key order", () => {
    expect(
      permissionKeyProblems([
        moduleWithPermissions("zeta", ["zeta.ok", "b", "a"]),
        moduleWithPermissions("alpha", ["x", "alpha.ok", "alpha."]),
      ]),
    ).toEqual([
      'zeta: permission key "b" must start with "zeta."',
      'zeta: permission key "a" must start with "zeta."',
      'alpha: permission key "x" must start with "alpha."',
      'alpha: permission key "alpha." must start with "alpha."',
    ]);
  });

  test.prop([
    fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
    fc.stringMatching(/^[a-z0-9][a-z0-9.-]{0,12}$/),
  ])(
    "accepts every key made of the module key, a dot and a non-empty name",
    (moduleKey, name) => {
      expect(
        permissionKeyProblems([
          moduleWithPermissions(moduleKey, [`${moduleKey}.${name}`]),
        ]),
      ).toEqual([]);
    },
  );

  test.prop([fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), fc.string()])(
    "reports exactly one problem for any key outside the module namespace",
    (moduleKey, permissionKey) => {
      fc.pre(
        !permissionKey.startsWith(`${moduleKey}.`) ||
          permissionKey === `${moduleKey}.`,
      );
      expect(
        permissionKeyProblems([
          moduleWithPermissions(moduleKey, [permissionKey]),
        ]),
      ).toEqual([
        `${moduleKey}: permission key "${permissionKey}" must start with "${moduleKey}."`,
      ]);
    },
  );
});

describe("loadFeatureModules", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "permission-keys-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("loads the module of every feature directory, sorted by directory name", async () => {
    write(
      "src/features/zeta/module.ts",
      'export default { key: "zeta", nav: [], routePrefixes: [], permissions: { "zeta.run": { defaultRoles: ["owner"], labelKey: "run" } } };\n',
    );
    write(
      "src/features/alpha/module.ts",
      'export default { key: "alpha", nav: [], routePrefixes: [] };\n',
    );
    write("src/features/notes/i18n/pl.json", "{}");

    const modules = await loadFeatureModules(root);

    expect(modules.map((moduleDef) => moduleDef.key)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(modules[1]!.permissions).toEqual({
      "zeta.run": { defaultRoles: ["owner"], labelKey: "run" },
    });
  });

  it("returns an empty list when src/features is absent", async () => {
    write("src/a.ts", "export const a = 1;\n");
    await expect(loadFeatureModules(root)).resolves.toEqual([]);
  });

  it("feeds permissionKeyProblems with a fixture module's bad key", async () => {
    write(
      "src/features/uploads/module.ts",
      'export default { key: "uploads", nav: [], routePrefixes: [], permissions: { "delete-others": { defaultRoles: ["owner"], labelKey: "x" } } };\n',
    );

    expect(permissionKeyProblems(await loadFeatureModules(root))).toEqual([
      'uploads: permission key "delete-others" must start with "uploads."',
    ]);
  });
});

describe("permission keys in the repo", () => {
  it("every module's permission keys start with its module key", async () => {
    expect(permissionKeyProblems(await loadFeatureModules(repoRoot))).toEqual(
      [],
    );
  });
});
