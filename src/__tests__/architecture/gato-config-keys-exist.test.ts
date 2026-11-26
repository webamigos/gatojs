// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findGatoConfigKeyProblems,
  findModuleKeyMismatches,
} from "../../../scripts/lib/architecture/gato-config-keys";

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

  it("reports a relative branding logo src", async () => {
    write(
      "src/gato.config.ts",
      'export default { branding: { logo: { src: "logo.svg", alt: "Acme", width: 120, height: 32 } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      'branding.logo.src: must start with a single "/" (a file in public/): logo.svg',
    ]);
  });

  it("reports module problems before branding problems", async () => {
    write(
      "src/gato.config.ts",
      'export default { branding: { logo: { src: "/logo.svg", alt: " ", width: 120, height: 32 } }, modules: { billing: {} } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.billing: unknown module: billing",
      "branding.logo.alt: must not be blank",
    ]);
  });

  it("accepts a valid branding logo", async () => {
    write(
      "src/gato.config.ts",
      'export default { branding: { logo: { src: "/logo.svg", alt: "Acme", width: 120, height: 32 } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([]);
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

  it("without a src/features directory every config key is unknown", async () => {
    fs.rmSync(path.join(root, "src/features"), {
      recursive: true,
      force: true,
    });
    write("src/gato.config.ts", "export default { modules: { x: {} } };\n");
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.x: unknown module: x",
    ]);
  });

  it("reports a permission the module does not declare", async () => {
    write(
      "src/features/uploads/module.ts",
      'export default { key: "uploads", nav: [], routePrefixes: [], permissions: { "uploads.delete-others": { defaultRoles: ["owner", "admin"], labelKey: "permission-delete-others" } } };\n',
    );
    write(
      "src/gato.config.ts",
      'export default { modules: { uploads: { permissions: { "uploads.nope": ["owner"] } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.uploads.permissions.uploads.nope: unknown permission: uploads.nope",
    ]);
  });

  it("returns an empty list for a config that overrides a declared permission", async () => {
    write(
      "src/features/uploads/module.ts",
      'export default { key: "uploads", nav: [], routePrefixes: [], permissions: { "uploads.delete-others": { defaultRoles: ["owner", "admin"], labelKey: "permission-delete-others" } } };\n',
    );
    write(
      "src/gato.config.ts",
      'export default { modules: { uploads: { permissions: { "uploads.delete-others": ["owner"] } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([]);
  });

  it("reports a permission for a module that declares none", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { dashboard: { permissions: { "dashboard.export": ["owner"] } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.dashboard.permissions.dashboard.export: unknown permission: dashboard.export",
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

describe("findGatoConfigKeyProblems: slots", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const loader = "() => Promise.resolve({ default: () => null })";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gato-config-slots-"));
    write("src/features/dashboard/module.ts", DASHBOARD_MODULE);
    write(
      "src/features/dashboard/slots.ts",
      'export const slotDefinitions = [{ id: "dashboard.sections", kind: "server" }, { id: "dashboard.widgets", kind: "client" }];\n',
    );
    write(
      "src/features/notes/module.ts",
      'export default { key: "notes", nav: [], routePrefixes: ["/notes"] };\n',
    );
    write(
      "src/features/notes/slots.ts",
      `export const slots = [{ slot: "dashboard.sections", id: "notes.summary-card", priority: 10, component: ${loader} }];\n`,
    );
    write(
      "src/features/notes/client-slots.ts",
      `export const clientSlots = [{ slot: "dashboard.widgets", id: "notes.widget", priority: 10, component: ${loader} }];\n`,
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports a slot the owner module does not declare", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { dashboard: { slots: { "dashboard.nope": { "notes.summary-card": null } } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.dashboard.slots.dashboard.nope: unknown slot: dashboard.nope",
    ]);
  });

  it("reports a contribution id that does not contribute to the slot", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { dashboard: { slots: { "dashboard.sections": { "notes.nope": null } } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.dashboard.slots.dashboard.sections.notes.nope: unknown contribution: notes.nope",
    ]);
  });

  it("returns an empty list for a null and a priority on contributions from slots.ts and client-slots.ts", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { dashboard: { slots: { "dashboard.sections": { "notes.summary-card": null }, "dashboard.widgets": { "notes.widget": { priority: 1 } } } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([]);
  });

  it("knows the core slot under modules.app and reports an unknown contribution to it", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { app: { slots: { "app.header.actions": { "x.y": null } } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.app.slots.app.header.actions.x.y: unknown contribution: x.y",
    ]);
  });

  it("reports modules.app fields other than slots as reserved", async () => {
    write(
      "src/gato.config.ts",
      "export default { modules: { app: { enabled: false } } };\n",
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.app.enabled: app is reserved for core-hosted slots; only slots is allowed",
    ]);
  });

  it("appends the slot problems after the module and branding problems", async () => {
    write(
      "src/gato.config.ts",
      'export default { branding: { logo: { src: "/logo.svg", alt: " ", width: 120, height: 32 } }, modules: { dashboard: { slots: { "dashboard.nope": { "notes.summary-card": null } } }, billing: {} } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.billing: unknown module: billing",
      "branding.logo.alt: must not be blank",
      "modules.dashboard.slots.dashboard.nope: unknown slot: dashboard.nope",
    ]);
  });

  it("a slot is unknown once the slots.ts of its owner is gone", async () => {
    fs.rmSync(path.join(root, "src/features/dashboard/slots.ts"));
    write(
      "src/gato.config.ts",
      'export default { modules: { dashboard: { slots: { "dashboard.sections": { "notes.summary-card": null } } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.dashboard.slots.dashboard.sections: unknown slot: dashboard.sections",
    ]);
  });
});

describe("findGatoConfigKeyProblems: component handles", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const loader = "() => Promise.resolve({ default: () => null })";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gato-config-components-"));
    write(
      "src/features/users/module.ts",
      'export default { key: "users", nav: [], routePrefixes: ["/users"] };\n',
    );
    write(
      "src/features/users/components.ts",
      'export const componentHandles = [{ id: "users.invite-dialog" }];\n',
    );
    write(
      "src/features/crm/module.ts",
      'export default { key: "crm", nav: [], routePrefixes: ["/crm"] };\n',
    );
    write(
      "src/features/crm/components.ts",
      `export const componentOverrides = [{ handle: "users.invite-dialog", mode: "replace", component: ${loader} }];\n`,
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports a handle the users module does not declare", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.nope": null } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.users.components.users.nope: unknown component handle: users.nope",
    ]);
  });

  it("returns an empty list for null on a declared handle", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.invite-dialog": null } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([]);
  });

  it("returns an empty list for module crm, which overrides the handle", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.invite-dialog": { module: "crm" } } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([]);
  });

  it("reports module users, which has no override of the handle", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.invite-dialog": { module: "users" } } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.users.components.users.invite-dialog.module: users has no enabled override of users.invite-dialog",
    ]);
  });

  it("a handle is unknown once the components.ts of its owner is gone", async () => {
    fs.rmSync(path.join(root, "src/features/users/components.ts"));
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.invite-dialog": null } } } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.users.components.users.invite-dialog: unknown component handle: users.invite-dialog",
    ]);
  });

  it("appends the component problems after the module problems", async () => {
    write(
      "src/gato.config.ts",
      'export default { modules: { users: { components: { "users.nope": null } }, billing: {} } };\n',
    );
    await expect(findGatoConfigKeyProblems(root)).resolves.toEqual([
      "modules.billing: unknown module: billing",
      "modules.users.components.users.nope: unknown component handle: users.nope",
    ]);
  });
});

describe("gato.config.ts in the repo", () => {
  it("names only existing modules and nav ids", async () => {
    await expect(findGatoConfigKeyProblems(repoRoot)).resolves.toEqual([]);
  });
});

describe("findModuleKeyMismatches", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const moduleWithKey = (key: string) =>
    `export default { key: "${key}", nav: [], routePrefixes: [] };\n`;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "module-key-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports a module whose key differs from its directory and not the matching one", async () => {
    write("src/features/notes/module.ts", moduleWithKey("note"));
    write("src/features/crm/module.ts", moduleWithKey("crm"));
    await expect(findModuleKeyMismatches(root)).resolves.toEqual([
      'src/features/notes/module.ts: key "note" differs from the directory name "notes"',
    ]);
  });

  it("returns an empty list when every key equals its directory", async () => {
    write("src/features/crm/module.ts", moduleWithKey("crm"));
    write("src/features/api-keys/module.ts", moduleWithKey("api-keys"));
    await expect(findModuleKeyMismatches(root)).resolves.toEqual([]);
  });

  it("sorts two mismatches by directory name", async () => {
    write("src/features/zeta/module.ts", moduleWithKey("z"));
    write("src/features/alpha/module.ts", moduleWithKey("a"));
    write("src/features/mid/module.ts", moduleWithKey("mid"));
    await expect(findModuleKeyMismatches(root)).resolves.toEqual([
      'src/features/alpha/module.ts: key "a" differs from the directory name "alpha"',
      'src/features/zeta/module.ts: key "z" differs from the directory name "zeta"',
    ]);
  });

  it("ignores a feature directory without module.ts", async () => {
    write("src/features/notes/i18n/pl.json", "{}");
    await expect(findModuleKeyMismatches(root)).resolves.toEqual([]);
  });

  it("returns an empty list when src/features is absent", async () => {
    write("src/a.ts", "export const a = 1;\n");
    await expect(findModuleKeyMismatches(root)).resolves.toEqual([]);
  });

  it("every module in the repo has a key equal to its directory", async () => {
    await expect(findModuleKeyMismatches(repoRoot)).resolves.toEqual([]);
  });
});
