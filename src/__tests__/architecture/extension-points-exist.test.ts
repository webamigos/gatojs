// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findExtensionPointProblems } from "../../../scripts/lib/architecture/extension-points";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

type Kind =
  | "modules"
  | "navItems"
  | "slots"
  | "components"
  | "events"
  | "commands"
  | "authPaths"
  | "permissions";

type Row = { key: string; module: string };
type Catalog = Record<Kind, Row[]>;

const row = (key: string, module: string): Row => ({ key, module });

const BASE_CATALOG: Catalog = {
  modules: [
    row("dashboard", "dashboard"),
    row("uploads", "uploads"),
    row("users", "users"),
  ],
  navItems: [row("dashboard.home", "dashboard")],
  slots: [
    row("app.header.actions", "app"),
    row("dashboard.sections", "dashboard"),
  ],
  components: [row("users.invite-dialog", "users")],
  events: [
    row("organizations.created", "organizations"),
    row("uploads.deleted", "uploads"),
  ],
  commands: [row("uploads.delete", "uploads")],
  authPaths: [row("/organization/create", "organizations")],
  permissions: [row("uploads.delete-others", "uploads")],
};

const DASHBOARD_MODULE = `export default {
  key: "dashboard",
  nav: [{ id: "dashboard.home", href: "/dashboard", labelKey: "nav", icon: "x", order: 10 }],
  routePrefixes: ["/dashboard"],
};
`;

const UPLOADS_MODULE = `export default {
  key: "uploads",
  nav: [],
  routePrefixes: ["/uploads"],
  permissions: { "uploads.delete-others": { defaultRoles: ["owner"], labelKey: "permission-delete-others" } },
};
`;

const USERS_MODULE = `export default { key: "users", nav: [], routePrefixes: ["/users"] };
`;

const DASHBOARD_SLOTS = `export const slotDefinitions = [{ id: "dashboard.sections", kind: "server" }];
`;

const CORE_SLOTS = `export const coreSlotDefinitions = [{ id: "app.header.actions", kind: "server" }];
`;

const DASHBOARD_PAGE = `export default function DashboardPage() {
  return <Slot id="dashboard.sections" context={{}} />;
}
`;

const LAYOUT = `export default function Layout() {
  return <Slot id="app.header.actions" context={{}} />;
}
`;

const INVITE_DIALOG = `export const InviteUserDialog = overridable("users.invite-dialog", () => null);
`;

const UPLOADS_EVENTS = `export const events = { "uploads.deleted": {} };
`;

const CORE_EVENTS = `export const coreEvents = { "organizations.created": {} };
`;

const DELETE_UPLOAD = `export async function deleteUpload(origin) {
  await emitEvent(origin, "uploads.deleted", {});
}
`;

const UPLOAD_COMMANDS = `export const deleteUpload = defineCommand({
  key: "uploads.delete",
  module: "uploads",
  run: async () => null,
});
`;

const ORGANIZATION_EVENTS = `export const ORGANIZATION_EVENT_PATHS = new Set(["/organization/create"]);

export function organizationCreated(origin) {
  return {
    origin: origin,
    name: "organizations.created",
    payload: {},
  };
}
`;

const COMMANDS_FILE =
  "src/features/uploads/services/commands/upload-commands.ts";
const DELETE_UPLOAD_FILE = "src/features/uploads/services/delete-upload.ts";
const ORGANIZATION_EVENTS_FILE = "src/shared/lib/auth/organization-events.ts";

describe("findExtensionPointProblems", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const remove = (relative: string) => {
    fs.rmSync(path.join(root, relative));
  };

  const writeCatalog = (catalog: Catalog) => {
    const expanded = Object.fromEntries(
      Object.entries(catalog).map(([kind, rows]) => [
        kind,
        rows.map((entry) => ({
          ...entry,
          stability: "stable",
          description: "x",
        })),
      ]),
    );
    write(
      "src/extension-points.generated.ts",
      `export const extensionPoints = ${JSON.stringify(expanded, null, 2)};\n`,
    );
  };

  const catalogWith = (patch: Partial<Catalog>) =>
    writeCatalog({ ...BASE_CATALOG, ...patch });

  const problems = () => findExtensionPointProblems(root);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "extension-points-"));
    write("src/features/dashboard/module.ts", DASHBOARD_MODULE);
    write("src/features/dashboard/slots.ts", DASHBOARD_SLOTS);
    write("src/app/dashboard/page.tsx", DASHBOARD_PAGE);
    write("src/shared/lib/modules/slots.ts", CORE_SLOTS);
    write("src/app/layout.tsx", LAYOUT);
    write("src/features/users/module.ts", USERS_MODULE);
    write(
      "src/features/users/components/invite-user-dialog.tsx",
      INVITE_DIALOG,
    );
    write("src/features/uploads/module.ts", UPLOADS_MODULE);
    write("src/features/uploads/events.ts", UPLOADS_EVENTS);
    write(DELETE_UPLOAD_FILE, DELETE_UPLOAD);
    write(COMMANDS_FILE, UPLOAD_COMMANDS);
    write("src/shared/lib/events/core-events.ts", CORE_EVENTS);
    write(ORGANIZATION_EVENTS_FILE, ORGANIZATION_EVENTS);
    writeCatalog(BASE_CATALOG);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("baseline", () => {
    it("returns an empty list when code and catalog agree on every kind", async () => {
      await expect(problems()).resolves.toEqual([]);
    });

    it("reports only the missing catalog when src/extension-points.generated.ts is absent", async () => {
      remove("src/extension-points.generated.ts");
      write("src/features/billing/module.ts", USERS_MODULE);
      remove("src/app/dashboard/page.tsx");
      await expect(problems()).resolves.toEqual([
        "src/extension-points.generated.ts: missing; run npm run wa -- generate",
      ]);
    });
  });

  describe("slots", () => {
    it("reports a declared slot that no page renders", async () => {
      remove("src/app/dashboard/page.tsx");
      await expect(problems()).resolves.toEqual([
        "dashboard.sections: declared in src/features/dashboard/slots.ts but never rendered",
      ]);
    });

    it("reports a core slot that no page renders", async () => {
      remove("src/app/layout.tsx");
      await expect(problems()).resolves.toEqual([
        "app.header.actions: declared in src/shared/lib/modules/slots.ts but never rendered",
      ]);
    });

    it("reports a ClientSlot render with id on the next line that nobody declares", async () => {
      write(
        "src/app/page.tsx",
        `export default function Page() {
  return (
    <ClientSlot
      id="dashboard.widgets"
      context={{}}
    />
  );
}
`,
      );
      await expect(problems()).resolves.toEqual([
        "dashboard.widgets: rendered but not declared (src/app/page.tsx)",
      ]);
    });

    it("counts a Slot whose id follows other attributes on later lines as a render", async () => {
      write(
        "src/app/dashboard/page.tsx",
        `export default function DashboardPage({ organizationId }) {
  return (
    <Slot
      context={{ organizationId }}
      fallback={null}
      id="dashboard.sections"
    />
  );
}
`,
      );
      await expect(problems()).resolves.toEqual([]);
    });

    it("counts visibleContributions with the slot id as a render", async () => {
      write(
        "src/features/users/slots.ts",
        'export const slotDefinitions = [{ id: "users.table.columns", kind: "client" }];\n',
      );
      write(
        "src/features/users/components/users-manager.tsx",
        `export function UsersManager({ viewer }) {
  const columns = visibleContributions(clientModuleSlots, "users.table.columns", viewer);
  return columns.length;
}
`,
      );
      catalogWith({
        slots: [...BASE_CATALOG.slots, row("users.table.columns", "users")],
      });
      await expect(problems()).resolves.toEqual([]);
    });

    it.each([
      "src/features/dashboard/__tests__/a.test.tsx",
      "src/features/dashboard/__tests__/page.tsx",
      "src/app/dashboard/page.test.tsx",
      "src/app/dashboard/page.spec.tsx",
      "src/app/dashboard/page.generated.ts",
    ])("does not count a render in %s", async (file) => {
      remove("src/app/dashboard/page.tsx");
      write(file, 'const page = <Slot id="dashboard.sections" />;\n');
      await expect(problems()).resolves.toEqual([
        "dashboard.sections: declared in src/features/dashboard/slots.ts but never rendered",
      ]);
    });

    it("ignores an undeclared slot rendered only in a test file", async () => {
      write(
        "src/features/x/__tests__/a.test.tsx",
        'const page = <ClientSlot id="x.nope" />;\n',
      );
      await expect(problems()).resolves.toEqual([]);
    });

    it("reports a catalog slot that its module does not declare", async () => {
      catalogWith({
        slots: [...BASE_CATALOG.slots, row("dashboard.widgets", "dashboard")],
      });
      await expect(problems()).resolves.toEqual([
        "dashboard.widgets: no defineSlot (expected in src/features/dashboard/slots.ts)",
      ]);
    });

    it("points a stale app slot to the core slots file", async () => {
      catalogWith({
        slots: [...BASE_CATALOG.slots, row("app.footer", "app")],
      });
      await expect(problems()).resolves.toEqual([
        "app.footer: no defineSlot (expected in src/shared/lib/modules/slots.ts)",
      ]);
    });

    it("reports a declared and rendered slot missing from the catalog", async () => {
      write(
        "src/features/dashboard/slots.ts",
        'export const slotDefinitions = [{ id: "dashboard.sections", kind: "server" }, { id: "dashboard.widgets", kind: "client" }];\n',
      );
      write(
        "src/app/dashboard/widgets.tsx",
        'export const Widgets = () => <ClientSlot id="dashboard.widgets" />;\n',
      );
      await expect(problems()).resolves.toEqual([
        "dashboard.widgets: missing from EXTENSION_POINTS.md (src/features/dashboard/slots.ts)",
      ]);
    });

    it("reports a core slot missing from the catalog with the core slots file", async () => {
      catalogWith({ slots: [row("dashboard.sections", "dashboard")] });
      await expect(problems()).resolves.toEqual([
        "app.header.actions: missing from EXTENSION_POINTS.md (src/shared/lib/modules/slots.ts)",
      ]);
    });
  });

  describe("commands", () => {
    it("reports a catalog command without defineCommand", async () => {
      remove(COMMANDS_FILE);
      await expect(problems()).resolves.toEqual([
        "uploads.delete: no defineCommand (expected in src/features/uploads/services/commands/)",
      ]);
    });

    it("reports a defineCommand key missing from the catalog with the file of the call", async () => {
      write(
        COMMANDS_FILE,
        `${UPLOAD_COMMANDS}
export const restoreUpload = defineCommand({
  key: "uploads.restore",
  module: "uploads",
  run: async () => null,
});
`,
      );
      await expect(problems()).resolves.toEqual([
        "uploads.restore: missing from EXTENSION_POINTS.md (src/features/uploads/services/commands/upload-commands.ts)",
      ]);
    });

    it("does not count a defineCommand in a test file", async () => {
      remove(COMMANDS_FILE);
      write(
        "src/features/uploads/services/commands/__tests__/upload-commands.test.ts",
        UPLOAD_COMMANDS,
      );
      await expect(problems()).resolves.toEqual([
        "uploads.delete: no defineCommand (expected in src/features/uploads/services/commands/)",
      ]);
    });
  });

  describe("events", () => {
    it("counts an events array in a defineCommand file as an emit", async () => {
      remove(DELETE_UPLOAD_FILE);
      write(
        COMMANDS_FILE,
        `export const deleteUpload = defineCommand({
  key: "uploads.delete",
  module: "uploads",
  events: ["uploads.deleted"],
  run: async () => null,
});
`,
      );
      await expect(problems()).resolves.toEqual([]);
    });

    it("does not count an events array in a file without defineCommand", async () => {
      remove(DELETE_UPLOAD_FILE);
      write(
        "src/features/uploads/services/event-list.ts",
        'export const config = { events: ["uploads.deleted"] };\n',
      );
      await expect(problems()).resolves.toEqual([
        "uploads.deleted: declared in src/features/uploads/events.ts but never emitted",
      ]);
    });

    it("reports a feature event declared and never emitted", async () => {
      remove(DELETE_UPLOAD_FILE);
      await expect(problems()).resolves.toEqual([
        "uploads.deleted: declared in src/features/uploads/events.ts but never emitted",
      ]);
    });

    it("counts name on the line after origin as an emit of a core event", async () => {
      write(
        ORGANIZATION_EVENTS_FILE,
        'export const ORGANIZATION_EVENT_PATHS = new Set(["/organization/create"]);\n',
      );
      await expect(problems()).resolves.toEqual([
        "organizations.created: declared in src/shared/lib/events/core-events.ts but never emitted",
      ]);
    });

    it("does not count an emitEvent in a test file", async () => {
      remove(DELETE_UPLOAD_FILE);
      write(
        "src/features/uploads/services/__tests__/delete-upload.test.ts",
        DELETE_UPLOAD,
      );
      await expect(problems()).resolves.toEqual([
        "uploads.deleted: declared in src/features/uploads/events.ts but never emitted",
      ]);
    });

    it("reports an emitted event that nobody declares with the file of the emit", async () => {
      write(
        DELETE_UPLOAD_FILE,
        `${DELETE_UPLOAD}
export async function purgeUploads(origin) {
  await emitEvent(origin, "uploads.purged", {});
}
`,
      );
      await expect(problems()).resolves.toEqual([
        "uploads.purged: emitted but not declared (src/features/uploads/services/delete-upload.ts)",
      ]);
    });

    it.each([
      ["users", "users.invited"],
      ["organizations", "organizations.deleted"],
      ["auth", "auth.signed-in"],
    ])("points a stale %s event to core-events.ts", async (module, key) => {
      catalogWith({ events: [...BASE_CATALOG.events, row(key, module)] });
      await expect(problems()).resolves.toEqual([
        `${key}: no event declaration (expected in src/shared/lib/events/core-events.ts)`,
      ]);
    });

    it("points a stale feature event to the events.ts of its module", async () => {
      catalogWith({
        events: [...BASE_CATALOG.events, row("uploads.restored", "uploads")],
      });
      await expect(problems()).resolves.toEqual([
        "uploads.restored: no event declaration (expected in src/features/uploads/events.ts)",
      ]);
    });

    it("reports a declared and emitted feature event missing from the catalog", async () => {
      write(
        "src/features/uploads/events.ts",
        'export const events = { "uploads.deleted": {}, "uploads.restored": {} };\n',
      );
      write(
        DELETE_UPLOAD_FILE,
        `${DELETE_UPLOAD}
export async function restoreUpload(origin) {
  await emitEvent(origin, "uploads.restored", {});
}
`,
      );
      await expect(problems()).resolves.toEqual([
        "uploads.restored: missing from EXTENSION_POINTS.md (src/features/uploads/events.ts)",
      ]);
    });

    it("reports a declared and emitted core event missing from the catalog", async () => {
      write(
        "src/shared/lib/events/core-events.ts",
        'export const coreEvents = { "organizations.created": {}, "users.invited": {} };\n',
      );
      write(
        "src/features/users/services/invite.ts",
        'export async function invite(origin) {\n  await emitEvent(origin, "users.invited", {});\n}\n',
      );
      await expect(problems()).resolves.toEqual([
        "users.invited: missing from EXTENSION_POINTS.md (src/shared/lib/events/core-events.ts)",
      ]);
    });
  });

  describe("components", () => {
    it("reports a catalog handle without overridable", async () => {
      remove("src/features/users/components/invite-user-dialog.tsx");
      await expect(problems()).resolves.toEqual([
        "users.invite-dialog: no overridable (expected in src/features/users/)",
      ]);
    });

    it("reports an overridable handle missing from the catalog with the file of the call", async () => {
      write(
        "src/features/users/components/remove-user-dialog.tsx",
        'export const RemoveUserDialog = overridable("users.remove-dialog", () => null);\n',
      );
      await expect(problems()).resolves.toEqual([
        "users.remove-dialog: missing from EXTENSION_POINTS.md (src/features/users/components/remove-user-dialog.tsx)",
      ]);
    });

    it("does not count overridable in a test file", async () => {
      remove("src/features/users/components/invite-user-dialog.tsx");
      write(
        "src/features/users/components/__tests__/invite-user-dialog.test.tsx",
        INVITE_DIALOG,
      );
      await expect(problems()).resolves.toEqual([
        "users.invite-dialog: no overridable (expected in src/features/users/)",
      ]);
    });
  });

  describe("modules", () => {
    it("reports a catalog module without module.ts", async () => {
      catalogWith({
        modules: [...BASE_CATALOG.modules, row("billing", "billing")],
      });
      await expect(problems()).resolves.toEqual([
        "billing: no module (expected in src/features/billing/module.ts)",
      ]);
    });

    it("reports a feature with module.ts missing from the catalog", async () => {
      write(
        "src/features/notes/module.ts",
        'export default { key: "notes", nav: [], routePrefixes: ["/notes"] };\n',
      );
      await expect(problems()).resolves.toEqual([
        "notes: missing from EXTENSION_POINTS.md (src/features/notes/module.ts)",
      ]);
    });

    it("ignores a feature directory without module.ts", async () => {
      write("src/features/notes/i18n/pl.json", "{}");
      await expect(problems()).resolves.toEqual([]);
    });
  });

  describe("nav items", () => {
    it("reports a catalog nav item that module.ts lacks", async () => {
      catalogWith({
        navItems: [
          ...BASE_CATALOG.navItems,
          row("dashboard.reports", "dashboard"),
        ],
      });
      await expect(problems()).resolves.toEqual([
        "dashboard.reports: no nav item (expected in src/features/dashboard/module.ts)",
      ]);
    });

    it("reports a nav item of module.ts missing from the catalog", async () => {
      write(
        "src/features/dashboard/module.ts",
        `export default {
  key: "dashboard",
  nav: [
    { id: "dashboard.home", href: "/dashboard", labelKey: "nav", icon: "x", order: 10 },
    { id: "dashboard.reports", href: "/dashboard/reports", labelKey: "reports", icon: "x", order: 20 },
  ],
  routePrefixes: ["/dashboard"],
};
`,
      );
      await expect(problems()).resolves.toEqual([
        "dashboard.reports: missing from EXTENSION_POINTS.md (src/features/dashboard/module.ts)",
      ]);
    });

    it("ignores a nav item without id", async () => {
      write(
        "src/features/dashboard/module.ts",
        `export default {
  key: "dashboard",
  nav: [
    { id: "dashboard.home", href: "/dashboard", labelKey: "nav", icon: "x", order: 10 },
    { href: "/dashboard/reports", labelKey: "reports", icon: "x", order: 20 },
  ],
  routePrefixes: ["/dashboard"],
};
`,
      );
      await expect(problems()).resolves.toEqual([]);
    });
  });

  describe("permissions", () => {
    it("reports a catalog permission that module.ts lacks", async () => {
      catalogWith({
        permissions: [
          ...BASE_CATALOG.permissions,
          row("uploads.purge", "uploads"),
        ],
      });
      await expect(problems()).resolves.toEqual([
        "uploads.purge: no permission (expected in src/features/uploads/module.ts)",
      ]);
    });

    it("reports a permission of module.ts missing from the catalog", async () => {
      write(
        "src/features/uploads/module.ts",
        `export default {
  key: "uploads",
  nav: [],
  routePrefixes: ["/uploads"],
  permissions: {
    "uploads.delete-others": { defaultRoles: ["owner"], labelKey: "permission-delete-others" },
    "uploads.purge": { defaultRoles: ["owner"], labelKey: "permission-purge" },
  },
};
`,
      );
      await expect(problems()).resolves.toEqual([
        "uploads.purge: missing from EXTENSION_POINTS.md (src/features/uploads/module.ts)",
      ]);
    });
  });

  describe("auth paths", () => {
    it("reports a catalog auth path outside ORGANIZATION_EVENT_PATHS", async () => {
      catalogWith({
        authPaths: [
          ...BASE_CATALOG.authPaths,
          row("/organization/delete", "organizations"),
        ],
      });
      await expect(problems()).resolves.toEqual([
        "/organization/delete: not in ORGANIZATION_EVENT_PATHS (expected in src/shared/lib/auth/organization-events.ts)",
      ]);
    });

    it("reports a path of ORGANIZATION_EVENT_PATHS missing from the catalog", async () => {
      write(
        ORGANIZATION_EVENTS_FILE,
        ORGANIZATION_EVENTS.replace(
          '"/organization/create"',
          '"/organization/create", "/organization/update"',
        ),
      );
      await expect(problems()).resolves.toEqual([
        "/organization/update: missing from EXTENSION_POINTS.md (src/shared/lib/auth/organization-events.ts)",
      ]);
    });
  });

  describe("namespacing", () => {
    it("reports a slot row filed under a module its key does not start with", async () => {
      catalogWith({
        slots: [
          row("app.header.actions", "app"),
          row("dashboard.sections", "users"),
        ],
      });
      await expect(problems()).resolves.toContain(
        'dashboard.sections: must start with "users."',
      );
    });

    it("reports a key that is only the module prefix", async () => {
      catalogWith({
        components: [...BASE_CATALOG.components, row("users.", "users")],
      });
      await expect(problems()).resolves.toContain(
        'users.: must start with "users."',
      );
    });

    it.each([
      ["navItems", row("dashboard.home", "users")],
      ["components", row("users.invite-dialog", "dashboard")],
      ["events", row("uploads.deleted", "users")],
      ["commands", row("uploads.delete", "users")],
      ["permissions", row("uploads.delete-others", "users")],
    ] as const)(
      "reports a %s row whose key does not start with its module",
      async (kind, misfiled) => {
        catalogWith({ [kind]: [misfiled] });
        await expect(problems()).resolves.toContain(
          `${misfiled.key}: must start with "${misfiled.module}."`,
        );
      },
    );
  });

  describe("order", () => {
    it("returns problems in kind order, then by key in code point order, then by message", async () => {
      write(
        "src/features/dashboard/slots.ts",
        'export const slotDefinitions = [{ id: "dashboard.sections", kind: "server" }, { id: "dashboard.widgets", kind: "client" }];\n',
      );
      writeCatalog({
        permissions: [
          ...BASE_CATALOG.permissions,
          row("uploads.purge", "uploads"),
        ],
        authPaths: [
          ...BASE_CATALOG.authPaths,
          row("/organization/delete", "organizations"),
        ],
        commands: [
          ...BASE_CATALOG.commands,
          row("uploads.archive", "uploads"),
          row("uploads.Zap", "uploads"),
        ],
        events: [...BASE_CATALOG.events, row("uploads.restored", "uploads")],
        components: [
          ...BASE_CATALOG.components,
          row("users.zz-dialog", "users"),
        ],
        slots: BASE_CATALOG.slots,
        navItems: [
          ...BASE_CATALOG.navItems,
          row("dashboard.reports", "dashboard"),
        ],
        modules: [
          row("zoo", "zoo"),
          ...BASE_CATALOG.modules,
          row("billing", "billing"),
        ],
      });
      await expect(problems()).resolves.toEqual([
        "billing: no module (expected in src/features/billing/module.ts)",
        "zoo: no module (expected in src/features/zoo/module.ts)",
        "dashboard.reports: no nav item (expected in src/features/dashboard/module.ts)",
        "dashboard.widgets: declared in src/features/dashboard/slots.ts but never rendered",
        "dashboard.widgets: missing from EXTENSION_POINTS.md (src/features/dashboard/slots.ts)",
        "users.zz-dialog: no overridable (expected in src/features/users/)",
        "uploads.restored: no event declaration (expected in src/features/uploads/events.ts)",
        "uploads.Zap: no defineCommand (expected in src/features/uploads/services/commands/)",
        "uploads.archive: no defineCommand (expected in src/features/uploads/services/commands/)",
        "/organization/delete: not in ORGANIZATION_EVENT_PATHS (expected in src/shared/lib/auth/organization-events.ts)",
        "uploads.purge: no permission (expected in src/features/uploads/module.ts)",
      ]);
    });
  });
});

describe("extension points of the repo", () => {
  it("the catalog and the code agree", async () => {
    await expect(findExtensionPointProblems(repoRoot)).resolves.toEqual([]);
  });
});
