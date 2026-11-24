import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { projectPackageLock } from "../package-lock.js";

const names = { name: "Acme Shop", slug: "acme-shop", snake: "acme_shop" };
const TOOL_KIT_ONLY = ["packages/gato-cli/**", "packages/create-gato-app/**"];

const NEXT_ENTRY = {
  version: "16.4.0",
  resolved: "https://registry.npmjs.org/next/-/next-16.4.0.tgz",
  integrity: "sha512-next",
  license: "MIT",
};
const ENV_WORKSPACE = {
  name: "@gatojs/env",
  version: "0.1.0",
  dependencies: { zod: "^4.3.6" },
};
const ENV_LINK = { resolved: "packages/env", link: true };

function kitLock(extraPackages: Record<string, unknown> = {}) {
  return {
    name: "wa-app",
    version: "9.9.9",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "wa-app",
        version: "9.9.9",
        workspaces: ["packages/*"],
        dependencies: { next: "^16.4.0" },
        devDependencies: { vitest: "^4.1.2" },
      },
      "node_modules/@gatojs/env": ENV_LINK,
      "node_modules/create-gato-app": {
        resolved: "packages/create-gato-app",
        link: true,
      },
      "node_modules/gato-cli": { resolved: "packages/gato-cli", link: true },
      "node_modules/next": NEXT_ENTRY,
      "packages/create-gato-app": {
        version: "0.1.0",
        dependencies: { "gato-cli": "0.2.1" },
      },
      "packages/create-gato-app/node_modules/globals": {
        version: "17.14.0",
        resolved: "https://registry.npmjs.org/globals/-/globals-17.14.0.tgz",
        integrity: "sha512-globals",
        dev: true,
      },
      "packages/env": ENV_WORKSPACE,
      "packages/gato-cli": { version: "0.2.1", bin: { gato: "dist/gato.mjs" } },
      ...extraPackages,
    },
  };
}

type Lock = {
  name: string;
  version?: string;
  lockfileVersion: number;
  requires?: boolean;
  packages: Record<string, Record<string, unknown>>;
};

function apply(lock: unknown, kitOnly: string[] = TOOL_KIT_ONLY): Lock {
  return JSON.parse(
    projectPackageLock(JSON.stringify(lock, null, 2), { kitOnly, names }),
  ) as Lock;
}

describe("projectPackageLock", () => {
  it("drops the kit-only workspaces, their nested modules and their links, keeping everything else", () => {
    const out = projectPackageLock(JSON.stringify(kitLock(), null, 2), {
      kitOnly: TOOL_KIT_ONLY,
      names,
    });
    expect(out).toBe(
      `${JSON.stringify(
        {
          name: "acme-shop",
          version: "0.1.0",
          lockfileVersion: 3,
          requires: true,
          packages: {
            "": {
              name: "acme-shop",
              version: "0.1.0",
              workspaces: ["packages/*"],
              dependencies: { next: "^16.4.0" },
              devDependencies: { vitest: "^4.1.2" },
            },
            "node_modules/@gatojs/env": {
              resolved: "packages/env",
              link: true,
            },
            "node_modules/next": {
              version: "16.4.0",
              resolved: "https://registry.npmjs.org/next/-/next-16.4.0.tgz",
              integrity: "sha512-next",
              license: "MIT",
            },
            "packages/env": {
              name: "@gatojs/env",
              version: "0.1.0",
              dependencies: { zod: "^4.3.6" },
            },
          },
        },
        null,
        2,
      )}\n`,
    );
  });

  it("removes the kit-only workspace keys themselves", () => {
    const keys = Object.keys(apply(kitLock()).packages);
    expect(keys).not.toContain("packages/gato-cli");
    expect(keys).not.toContain("packages/create-gato-app");
  });

  it("removes nested node_modules under a removed workspace", () => {
    expect(Object.keys(apply(kitLock()).packages)).not.toContain(
      "packages/create-gato-app/node_modules/globals",
    );
  });

  it("removes link entries pointing at a removed workspace", () => {
    const keys = Object.keys(apply(kitLock()).packages);
    expect(keys).not.toContain("node_modules/gato-cli");
    expect(keys).not.toContain("node_modules/create-gato-app");
  });

  it("keeps a project workspace and its link byte-identical", () => {
    const packages = apply(kitLock()).packages;
    expect(packages["packages/env"]).toEqual({
      name: "@gatojs/env",
      version: "0.1.0",
      dependencies: { zod: "^4.3.6" },
    });
    expect(packages["node_modules/@gatojs/env"]).toEqual({
      resolved: "packages/env",
      link: true,
    });
  });

  it("keeps a workspace that only shares a name prefix with a kit-only one", () => {
    const packages = apply(
      kitLock({
        "node_modules/gato-cli-extra": {
          resolved: "packages/gato-cli-extra",
          link: true,
        },
        "packages/gato-cli-extra": { version: "1.0.0" },
      }),
      ["packages/gato-cli/**"],
    ).packages;
    expect(packages["packages/gato-cli-extra"]).toEqual({ version: "1.0.0" });
    expect(packages["node_modules/gato-cli-extra"]).toEqual({
      resolved: "packages/gato-cli-extra",
      link: true,
    });
    expect(packages["packages/gato-cli"]).toBeUndefined();
    expect(packages["node_modules/gato-cli"]).toBeUndefined();
  });

  it("keeps workspaces that are not listed as kit-only", () => {
    const packages = apply(kitLock(), ["packages/gato-cli/**"]).packages;
    expect(packages["packages/create-gato-app"]).toEqual({
      version: "0.1.0",
      dependencies: { "gato-cli": "0.2.1" },
    });
    expect(packages["node_modules/create-gato-app"]).toEqual({
      resolved: "packages/create-gato-app",
      link: true,
    });
    expect(
      packages["packages/create-gato-app/node_modules/globals"],
    ).toMatchObject({ version: "17.14.0" });
  });

  it("with an empty kitOnly keeps every package entry", () => {
    expect(Object.keys(apply(kitLock(), []).packages)).toEqual([
      "",
      "node_modules/@gatojs/env",
      "node_modules/create-gato-app",
      "node_modules/gato-cli",
      "node_modules/next",
      "packages/create-gato-app",
      "packages/create-gato-app/node_modules/globals",
      "packages/env",
      "packages/gato-cli",
    ]);
  });

  it("renames the lock and its root package to the project slug", () => {
    const out = apply(kitLock());
    expect(out.name).toBe("acme-shop");
    expect(out.packages[""]?.name).toBe("acme-shop");
  });

  it("sets the root package version and the top-level version to 0.1.0", () => {
    const out = apply(kitLock());
    expect(out.version).toBe("0.1.0");
    expect(out.packages[""]?.version).toBe("0.1.0");
  });

  it("keeps lockfileVersion and requires unchanged", () => {
    const out = apply(kitLock());
    expect(out.lockfileVersion).toBe(3);
    expect(out.requires).toBe(true);
  });

  it("an empty kit lock only gets the slug as its name", () => {
    expect(
      projectPackageLock(
        '{"name":"wa-app","lockfileVersion":3,"packages":{}}',
        {
          kitOnly: TOOL_KIT_ONLY,
          names,
        },
      ),
    ).toBe(
      '{\n  "name": "acme-shop",\n  "lockfileVersion": 3,\n  "packages": {}\n}\n',
    );
  });

  test.prop([
    fc.dictionary(
      fc.stringMatching(/^node_modules\/dep-[a-z0-9-]{1,10}$/),
      fc.record({ version: fc.constantFrom("1.0.0", "2.3.4") }),
      { maxKeys: 8 },
    ),
  ])("is idempotent and keeps ordinary registry entries", (registryEntries) => {
    const once = projectPackageLock(JSON.stringify(kitLock(registryEntries)), {
      kitOnly: TOOL_KIT_ONLY,
      names,
    });
    const twice = projectPackageLock(once, { kitOnly: TOOL_KIT_ONLY, names });
    expect(twice).toBe(once);
    const packages = (JSON.parse(once) as Lock).packages;
    for (const [key, value] of Object.entries(registryEntries)) {
      expect(packages[key]).toEqual(value);
    }
  });
});

function findRepoRoot(start: string): string {
  let dir = resolve(start);
  while (!(
    existsSync(join(dir, "kit/kit.json")) &&
    existsSync(join(dir, "packages/gato-cli/package.json"))
  )) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Repository root not found");
    dir = parent;
  }
  return dir;
}

describe("projectPackageLock on the real kit lock", () => {
  const repoRoot = findRepoRoot(import.meta.dirname);
  const kitConfig = JSON.parse(
    readFileSync(join(repoRoot, "kit/kit.json"), "utf8"),
  ) as { kitOnly: string[] };
  const realLock = readFileSync(join(repoRoot, "package-lock.json"), "utf8");

  function assembled(): Lock {
    return JSON.parse(
      projectPackageLock(realLock, {
        kitOnly: kitConfig.kitOnly,
        names: { name: "Acme Crm", slug: "acme-crm", snake: "acme_crm" },
      }),
    ) as Lock;
  }

  it("has no entry of the tool workspaces", () => {
    const out = assembled();
    expect(
      Object.keys(out.packages).filter(
        (key) => key.includes("gato-cli") || key.includes("create-gato-app"),
      ),
    ).toEqual([]);
  });

  it("keeps the @gatojs/env workspace link", () => {
    const out = assembled();
    expect(out.packages["node_modules/@gatojs/env"]).toEqual({
      resolved: "packages/env",
      link: true,
    });
    expect(out.packages["packages/env"]).toBeDefined();
  });

  it("every remaining link resolves to an existing package entry", () => {
    const out = assembled();
    const dangling = Object.entries(out.packages)
      .filter(([, entry]) => entry.link === true)
      .map(([, entry]) => entry.resolved as string)
      .filter((resolved) => !(resolved in out.packages));
    expect(dangling).toEqual([]);
  });

  it("is named after the project", () => {
    const out = assembled();
    expect(out.name).toBe("acme-crm");
    expect(out.packages[""]?.name).toBe("acme-crm");
  });
});
