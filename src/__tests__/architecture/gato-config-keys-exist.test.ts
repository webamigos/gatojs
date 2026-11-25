// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findGatoConfigKeyProblems } from "../../../scripts/lib/architecture/gato-config-keys";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const DASHBOARD_MODULE = `export default {
  key: "dashboard",
  nav: [{ id: "dashboard.home", href: "/dashboard", labelKey: "nav", icon: "x", order: 10 }],
  routePrefixes: ["/dashboard"],
};
`;

const AUTH_MODULE = `export default { key: "auth", nav: [], routePrefixes: ["/sign-in"], public: true };
`;

describe("findGatoConfigKeyProblems", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gato-config-keys-"));
    write("src/features/dashboard/module.ts", DASHBOARD_MODULE);
    write("src/features/auth/module.ts", AUTH_MODULE);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty list when src/gato.config.ts is absent", async () => {
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([]);
  });

  it("reports a bad module key and a bad nav id together", async () => {
    write(
      "src/gato.config.ts",
      `export default {
  modules: {
    billing: {},
    dashboard: { nav: { "dashboard.nope": { order: 1 } } },
  },
};
`,
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.billing: unknown module: billing",
      "modules.dashboard.nav.dashboard.nope: unknown nav id: dashboard.nope",
    ]);
  });

  it("returns an empty list for a config that only uses existing keys", async () => {
    write(
      "src/gato.config.ts",
      `export default {
  modules: {
    dashboard: { nav: { "dashboard.home": { order: 5 } } },
    auth: { enabled: true },
  },
};
`,
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([]);
  });

  it("reports disabling auth", async () => {
    write(
      "src/gato.config.ts",
      "export default { modules: { auth: { enabled: false } } };\n",
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.auth.enabled: auth cannot be disabled",
    ]);
  });

  it("a feature directory without module.ts is not a known module", async () => {
    write("src/features/notes/i18n/pl.json", "{}");
    write(
      "src/gato.config.ts",
      "export default { modules: { notes: { enabled: false } } };\n",
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.notes: unknown module: notes",
    ]);
  });

  it("a module from every feature directory is known", async () => {
    write(
      "src/features/zeta/module.ts",
      'export default { key: "zeta", nav: [{ id: "zeta.list", href: "/zeta", labelKey: "nav", icon: "x", order: 1 }], routePrefixes: ["/zeta"] };\n',
    );
    write(
      "src/gato.config.ts",
      'export default { modules: { zeta: { nav: { "zeta.list": { hidden: true } } }, dashboard: { enabled: false } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([]);
  });
});

describe("gato.config.ts in the repo", () => {
  it("names only existing modules and nav ids", async () => {
    await expect(findGatoConfigKeyProblems(repoRoot)).resolves.toEqual([]);
  });
});
