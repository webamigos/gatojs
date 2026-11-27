import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import {
  readExtensionPoints,
  renderExtensionPointsMarkdown,
  renderExtensionPointsTs,
} from "../extension-points.js";
import type { ExtensionPointCatalog } from "../extension-points.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function project(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gato-extension-points-"));
  tmpDirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(
      join(dir, path),
      typeof content === "string" ? content : JSON.stringify(content, null, 2),
    );
  }
  return dir;
}

const DEMO_FILE = "src/features/demo/extension-points.json";
const APP_FILE = "src/shared/lib/modules/extension-points.json";
const DEMO_PATH_PREFIX = /^src\/features\/demo\/extension-points\.json: /;
const APP_PATH_PREFIX = /^src\/shared\/lib\/modules\/extension-points\.json: /;

const EMPTY: ExtensionPointCatalog = {
  modules: [],
  navItems: [],
  slots: [],
  components: [],
  events: [],
  commands: [],
  authPaths: [],
  permissions: [],
};

const DESCRIPTION_160 =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostr.";
const DESCRIPTION_161 = `${DESCRIPTION_160}x`;

describe("readExtensionPoints", () => {
  it("lists the module row, the nav item and the slot of a dashboard feature", async () => {
    const dir = await project({
      "src/features/dashboard/extension-points.json": {
        stability: "stable",
        description: "Dashboard page and its sections",
        nav: {
          "dashboard.home": {
            stability: "stable",
            description: "Dashboard link in the sidebar",
          },
        },
        slots: {
          "dashboard.sections": {
            stability: "stable",
            description: "Sections",
          },
        },
      },
    });
    await expect(
      readExtensionPoints(dir, [{ name: "dashboard", hasModuleTs: true }]),
    ).resolves.toEqual({
      ...EMPTY,
      modules: [
        {
          key: "dashboard",
          module: "dashboard",
          stability: "stable",
          description: "Dashboard page and its sections",
        },
      ],
      navItems: [
        {
          key: "dashboard.home",
          module: "dashboard",
          stability: "stable",
          description: "Dashboard link in the sidebar",
        },
      ],
      slots: [
        {
          key: "dashboard.sections",
          module: "dashboard",
          stability: "stable",
          description: "Sections",
        },
      ],
    });
  });

  it("maps every file key to its catalog kind, nav to navItems and the rest by name", async () => {
    const point = (description: string) => ({
      stability: "experimental",
      description,
    });
    const dir = await project({
      [DEMO_FILE]: {
        nav: { "demo.nav": point("N") },
        slots: { "demo.slot": point("S") },
        components: { "demo.component": point("C") },
        events: { "demo.event": point("E") },
        commands: { "demo.command": point("K") },
        authPaths: { "/organization/create": point("A") },
        permissions: { "demo.permission": point("P") },
      },
    });
    const row = (key: string, description: string) => ({
      key,
      module: "demo",
      stability: "experimental",
      description,
    });
    await expect(
      readExtensionPoints(dir, [{ name: "demo", hasModuleTs: false }]),
    ).resolves.toEqual({
      modules: [],
      navItems: [row("demo.nav", "N")],
      slots: [row("demo.slot", "S")],
      components: [row("demo.component", "C")],
      events: [row("demo.event", "E")],
      commands: [row("demo.command", "K")],
      authPaths: [row("/organization/create", "A")],
      permissions: [row("demo.permission", "P")],
    });
  });

  it("sorts rows of features zeta and alpha by key, not by the registry order", async () => {
    const dir = await project({
      "src/features/zeta/extension-points.json": {
        stability: "stable",
        description: "Zeta",
        events: {
          "zeta.b": { stability: "stable", description: "B" },
          "zeta.a": { stability: "stable", description: "A" },
        },
      },
      "src/features/alpha/extension-points.json": {
        stability: "stable",
        description: "Alpha",
        events: { "alpha.a": { stability: "stable", description: "A" } },
      },
    });
    const catalog = await readExtensionPoints(dir, [
      { name: "zeta", hasModuleTs: true },
      { name: "alpha", hasModuleTs: true },
    ]);
    expect(catalog.events.map((row) => row.key)).toEqual([
      "alpha.a",
      "zeta.a",
      "zeta.b",
    ]);
    expect(catalog.modules.map((row) => row.key)).toEqual(["alpha", "zeta"]);
  });

  it("orders keys by code point: users.table.columns before users.table.row-actions and a.B before a.a", async () => {
    const point = { stability: "stable", description: "x" };
    const dir = await project({
      [DEMO_FILE]: {
        slots: {
          "users.table.row-actions": point,
          "users.table.columns": point,
        },
        events: { "a.a": point, "a.B": point },
        commands: { a_b: point, "a.b": point, "a-b": point },
      },
    });
    const catalog = await readExtensionPoints(dir, [
      { name: "demo", hasModuleTs: false },
    ]);
    expect(catalog.slots.map((row) => row.key)).toEqual([
      "users.table.columns",
      "users.table.row-actions",
    ]);
    expect(catalog.events.map((row) => row.key)).toEqual(["a.B", "a.a"]);
    expect(catalog.commands.map((row) => row.key)).toEqual([
      "a-b",
      "a.b",
      "a_b",
    ]);
  });

  it("breaks a tie on the same key by module", async () => {
    const point = { stability: "stable", description: "x" };
    const dir = await project({
      "src/features/zeta/extension-points.json": {
        slots: { "shared.panel": point },
      },
      "src/features/alpha/extension-points.json": {
        slots: { "shared.panel": point },
      },
    });
    const catalog = await readExtensionPoints(dir, [
      { name: "zeta", hasModuleTs: false },
      { name: "alpha", hasModuleTs: false },
    ]);
    expect(catalog.slots.map((row) => row.module)).toEqual(["alpha", "zeta"]);
  });

  it("gives a feature with module.ts and no file an experimental module row with description -", async () => {
    const dir = await project({});
    await expect(
      readExtensionPoints(dir, [{ name: "notes", hasModuleTs: true }]),
    ).resolves.toEqual({
      ...EMPTY,
      modules: [
        {
          key: "notes",
          module: "notes",
          stability: "experimental",
          description: "-",
        },
      ],
    });
  });

  it("gives a feature whose file lacks the top-level fields an experimental module row with description -", async () => {
    const dir = await project({
      "src/features/notes/extension-points.json": {
        slots: { "notes.panel": { stability: "stable", description: "Panel" } },
      },
    });
    const catalog = await readExtensionPoints(dir, [
      { name: "notes", hasModuleTs: true },
    ]);
    expect(catalog.modules).toEqual([
      {
        key: "notes",
        module: "notes",
        stability: "experimental",
        description: "-",
      },
    ]);
  });

  it("lists the points of a feature without module.ts but gives it no module row", async () => {
    const dir = await project({
      [DEMO_FILE]: {
        stability: "stable",
        description: "Demo",
        events: { "demo.done": { stability: "stable", description: "Done" } },
      },
    });
    await expect(
      readExtensionPoints(dir, [{ name: "demo", hasModuleTs: false }]),
    ).resolves.toEqual({
      ...EMPTY,
      events: [
        {
          key: "demo.done",
          module: "demo",
          stability: "stable",
          description: "Done",
        },
      ],
    });
  });

  it("lists a slot of the app file under module app without an app module row", async () => {
    const dir = await project({
      [APP_FILE]: {
        slots: {
          "app.header.actions": {
            stability: "stable",
            description: "Header actions",
          },
        },
      },
    });
    await expect(readExtensionPoints(dir, [])).resolves.toEqual({
      ...EMPTY,
      slots: [
        {
          key: "app.header.actions",
          module: "app",
          stability: "stable",
          description: "Header actions",
        },
      ],
    });
  });

  it("returns an empty catalog without features and without the app file", async () => {
    const dir = await project({});
    await expect(readExtensionPoints(dir, [])).resolves.toEqual(EMPTY);
  });

  it.each([
    ["description", { description: "App" }],
    ["stability", { stability: "stable" }],
  ])(
    "rejects a top-level %s in the app file with the file path first",
    async (_field, topLevel) => {
      const dir = await project({ [APP_FILE]: { ...topLevel, slots: {} } });
      await expect(readExtensionPoints(dir, [])).rejects.toThrow(
        APP_PATH_PREFIX,
      );
    },
  );

  it.each([
    ["invalid JSON text", '{ "slots": '],
    ["an unknown top-level field", '{ "hooks": {} }'],
    [
      "the catalog kind name navItems instead of nav",
      '{ "navItems": { "demo.home": { "stability": "stable", "description": "Home" } } }',
    ],
    [
      "a modules field",
      '{ "modules": { "demo": { "stability": "stable", "description": "Demo" } } }',
    ],
    [
      "an unknown point field",
      '{ "slots": { "demo.panel": { "stability": "stable", "description": "Panel", "label": "x" } } }',
    ],
    [
      "stability beta",
      '{ "slots": { "demo.panel": { "stability": "beta", "description": "Panel" } } }',
    ],
    [
      "a missing stability",
      '{ "slots": { "demo.panel": { "description": "Panel" } } }',
    ],
    [
      "a missing description",
      '{ "slots": { "demo.panel": { "stability": "stable" } } }',
    ],
    [
      "an empty description",
      '{ "slots": { "demo.panel": { "stability": "stable", "description": "" } } }',
    ],
    [
      "a description with |",
      '{ "slots": { "demo.panel": { "stability": "stable", "description": "a | b" } } }',
    ],
    [
      "a description with a newline",
      '{ "slots": { "demo.panel": { "stability": "stable", "description": "a\\nb" } } }',
    ],
    [
      "a description of 161 characters",
      `{ "slots": { "demo.panel": { "stability": "stable", "description": "${DESCRIPTION_161}" } } }`,
    ],
    [
      "a description that is not a string",
      '{ "slots": { "demo.panel": { "stability": "stable", "description": 5 } } }',
    ],
    ["a point that is not an object", '{ "slots": { "demo.panel": "Panel" } }'],
    ["a kind that is an array", '{ "slots": [] }'],
    [
      "a top-level stability beta",
      '{ "stability": "beta", "description": "Demo" }',
    ],
    [
      "an empty top-level description",
      '{ "stability": "stable", "description": "" }',
    ],
    ["a file that is an array", "[]"],
  ])(
    "rejects %s with the repo-relative file path first",
    async (_case, text) => {
      const dir = await project({ [DEMO_FILE]: text });
      await expect(
        readExtensionPoints(dir, [{ name: "demo", hasModuleTs: true }]),
      ).rejects.toThrow(DEMO_PATH_PREFIX);
    },
  );

  it("rejects a feature whose extension-points.json is a directory instead of treating it as absent", async () => {
    const dir = await project({});
    await mkdir(join(dir, DEMO_FILE), { recursive: true });
    await expect(
      readExtensionPoints(dir, [{ name: "demo", hasModuleTs: true }]),
    ).rejects.toThrow(/EISDIR/);
  });

  it("accepts a description of 160 characters unchanged", async () => {
    const dir = await project({
      [DEMO_FILE]: {
        slots: {
          "demo.panel": { stability: "stable", description: DESCRIPTION_160 },
        },
      },
    });
    const catalog = await readExtensionPoints(dir, [
      { name: "demo", hasModuleTs: false },
    ]);
    expect(catalog.slots).toEqual([
      {
        key: "demo.panel",
        module: "demo",
        stability: "stable",
        description: DESCRIPTION_160,
      },
    ]);
  });

  const FEATURES = ["alpha", "beta", "gamma"];

  test.prop(
    [
      fc.uniqueArray(
        fc.tuple(
          fc.stringMatching(/^[A-Za-z0-9._-]{1,8}$/),
          fc.constantFrom(...FEATURES),
        ),
        { selector: ([key]) => key, maxLength: 12 },
      ),
      fc.shuffledSubarray(FEATURES, { minLength: 3, maxLength: 3 }),
    ],
    { numRuns: 30 },
  )(
    "lists every event once, in code point order, whatever the feature order",
    async (points, featureOrder) => {
      const files: Record<string, unknown> = {};
      for (const feature of FEATURES) {
        files[`src/features/${feature}/extension-points.json`] = {
          events: Object.fromEntries(
            points
              .filter(([, owner]) => owner === feature)
              .map(([key]) => [key, { stability: "stable", description: "d" }]),
          ),
        };
      }
      const dir = await project(files);
      const catalog = await readExtensionPoints(
        dir,
        featureOrder.map((name) => ({ name, hasModuleTs: false })),
      );
      const keys = catalog.events.map((row) => row.key);
      for (let index = 1; index < keys.length; index++) {
        const previous = keys[index - 1];
        const current = keys[index];
        expect(previous < current || previous === current).toBe(true);
      }
      expect(
        new Map(catalog.events.map((row) => [row.key, row.module])),
      ).toEqual(new Map(points));
      expect(keys).toHaveLength(points.length);
    },
  );
});

const TS_HEADER = [
  "// generated by GatoJS — do not edit. Run: npm run wa -- generate",
  'export type ExtensionPointStability = "stable" | "experimental";',
  "",
  "export interface ExtensionPoint {",
  "  key: string;",
  "  module: string;",
  "  stability: ExtensionPointStability;",
  "  description: string;",
  "}",
  "",
  "export const extensionPoints = {",
];

const TS_SATISFIES =
  "} as const satisfies Record<string, readonly ExtensionPoint[]>;";

describe("renderExtensionPointsTs", () => {
  it("renders an empty catalog with every list empty and every union never", () => {
    expect(renderExtensionPointsTs(EMPTY)).toBe(
      [
        ...TS_HEADER,
        "  modules: [],",
        "  navItems: [],",
        "  slots: [],",
        "  components: [],",
        "  events: [],",
        "  commands: [],",
        "  authPaths: [],",
        "  permissions: [],",
        TS_SATISFIES,
        "",
        "export type ModuleKey = never;",
        "export type NavItemId = never;",
        "export type SlotId = never;",
        "export type ComponentHandle = never;",
        "export type EventName = never;",
        "export type CommandKey = never;",
        "export type PermissionKey = never;",
        "",
      ].join("\n"),
    );
  });

  it("renders two events as rows and as the EventName union", () => {
    expect(
      renderExtensionPointsTs({
        ...EMPTY,
        events: [
          {
            key: "a.x",
            module: "a",
            stability: "stable",
            description: "A happened",
          },
          {
            key: "b.y",
            module: "b",
            stability: "experimental",
            description: "B happened",
          },
        ],
      }),
    ).toBe(
      [
        ...TS_HEADER,
        "  modules: [],",
        "  navItems: [],",
        "  slots: [],",
        "  components: [],",
        "  events: [",
        '    { key: "a.x", module: "a", stability: "stable", description: "A happened" },',
        '    { key: "b.y", module: "b", stability: "experimental", description: "B happened" },',
        "  ],",
        "  commands: [],",
        "  authPaths: [],",
        "  permissions: [],",
        TS_SATISFIES,
        "",
        "export type ModuleKey = never;",
        "export type NavItemId = never;",
        "export type SlotId = never;",
        "export type ComponentHandle = never;",
        'export type EventName = "a.x" | "b.y";',
        "export type CommandKey = never;",
        "export type PermissionKey = never;",
        "",
      ].join("\n"),
    );
  });

  it("puts each kind into its own list and union, auth paths into no union", () => {
    const row = (key: string) => ({
      key,
      module: "m",
      stability: "stable" as const,
      description: "d",
    });
    expect(
      renderExtensionPointsTs({
        modules: [row("m")],
        navItems: [row("m.nav")],
        slots: [row("m.slot")],
        components: [row("m.component")],
        events: [row("m.event")],
        commands: [row("m.command")],
        authPaths: [row("/organization/create")],
        permissions: [row("m.permission")],
      }),
    ).toBe(
      [
        ...TS_HEADER,
        "  modules: [",
        '    { key: "m", module: "m", stability: "stable", description: "d" },',
        "  ],",
        "  navItems: [",
        '    { key: "m.nav", module: "m", stability: "stable", description: "d" },',
        "  ],",
        "  slots: [",
        '    { key: "m.slot", module: "m", stability: "stable", description: "d" },',
        "  ],",
        "  components: [",
        '    { key: "m.component", module: "m", stability: "stable", description: "d" },',
        "  ],",
        "  events: [",
        '    { key: "m.event", module: "m", stability: "stable", description: "d" },',
        "  ],",
        "  commands: [",
        '    { key: "m.command", module: "m", stability: "stable", description: "d" },',
        "  ],",
        "  authPaths: [",
        '    { key: "/organization/create", module: "m", stability: "stable", description: "d" },',
        "  ],",
        "  permissions: [",
        '    { key: "m.permission", module: "m", stability: "stable", description: "d" },',
        "  ],",
        TS_SATISFIES,
        "",
        'export type ModuleKey = "m";',
        'export type NavItemId = "m.nav";',
        'export type SlotId = "m.slot";',
        'export type ComponentHandle = "m.component";',
        'export type EventName = "m.event";',
        'export type CommandKey = "m.command";',
        'export type PermissionKey = "m.permission";',
        "",
      ].join("\n"),
    );
  });

  it("escapes a quote and a backslash in a description as JSON", () => {
    const ts = renderExtensionPointsTs({
      ...EMPTY,
      slots: [
        {
          key: "demo.panel",
          module: "demo",
          stability: "stable",
          description: 'Say "hi" \\ bye',
        },
      ],
    });
    expect(ts.split("\n")).toContain(
      '    { key: "demo.panel", module: "demo", stability: "stable", description: "Say \\"hi\\" \\\\ bye" },',
    );
  });
});

const MD_INTRO = [
  "<!-- generated by GatoJS — do not edit. Run: npm run wa -- generate -->",
  "# Extension points",
  "",
  "Change GatoJS behaviour through these keys, not by editing Gato files (skill: `.claude/skills/gato-extend/SKILL.md`). A `stable` key changes only with a `kitFormat` bump and a release note naming the old and new key; an `experimental` key can change in any release. Labels and descriptions live in each module's `extension-points.json`.",
  "",
];

const TABLE_HEAD = [
  "| Key | Module | Label | Description |",
  "| --- | --- | --- | --- |",
];

describe("renderExtensionPointsMarkdown", () => {
  it("renders every section of an empty catalog in order with _None._", () => {
    expect(renderExtensionPointsMarkdown(EMPTY)).toBe(
      [
        ...MD_INTRO,
        "## Modules",
        "",
        "Configure under `modules.<key>` in `src/gato.config.ts`.",
        "",
        "_None._",
        "",
        "## Nav items",
        "",
        "Reorder or hide under `modules.<module>.nav` in `src/gato.config.ts`.",
        "",
        "_None._",
        "",
        "## Slots",
        "",
        "Contribute from `slots.ts` or `client-slots.ts`; reorder or remove contributions under `modules.<module>.slots`.",
        "",
        "_None._",
        "",
        "## Component handles",
        "",
        "Replace or wrap from `components.ts` or under `modules.<module>.components`.",
        "",
        "_None._",
        "",
        "## Events",
        "",
        "Subscribe from `subscribers.ts`; subscribers run after the operation succeeded.",
        "",
        "_None._",
        "",
        "## Commands",
        "",
        "Add `before` hooks from `command-hooks.ts`.",
        "",
        "_None._",
        "",
        "## Better-auth paths",
        "",
        "Not GatoJS commands: hook them with a `before` or `after` hook in your module's `auth.ts` plugin.",
        "",
        "_None._",
        "",
        "## Permissions",
        "",
        "Check with `can(context, key)`; change default roles under `modules.<module>.permissions`.",
        "",
        "_None._",
        "",
      ].join("\n"),
    );
  });

  it("renders tables for filled kinds and _None._ for the empty ones", () => {
    expect(
      renderExtensionPointsMarkdown({
        ...EMPTY,
        modules: [
          {
            key: "account",
            module: "account",
            stability: "stable",
            description: "Account page",
          },
        ],
        authPaths: [
          {
            key: "/organization/create",
            module: "organizations",
            stability: "stable",
            description: "Create an organization",
          },
        ],
        permissions: [
          {
            key: "uploads.delete-others",
            module: "uploads",
            stability: "stable",
            description: "Delete files of others",
          },
          {
            key: "uploads.view",
            module: "uploads",
            stability: "experimental",
            description: "See files",
          },
        ],
      }),
    ).toBe(
      [
        ...MD_INTRO,
        "## Modules",
        "",
        "Configure under `modules.<key>` in `src/gato.config.ts`.",
        "",
        ...TABLE_HEAD,
        "| `account` | account | stable | Account page |",
        "",
        "## Nav items",
        "",
        "Reorder or hide under `modules.<module>.nav` in `src/gato.config.ts`.",
        "",
        "_None._",
        "",
        "## Slots",
        "",
        "Contribute from `slots.ts` or `client-slots.ts`; reorder or remove contributions under `modules.<module>.slots`.",
        "",
        "_None._",
        "",
        "## Component handles",
        "",
        "Replace or wrap from `components.ts` or under `modules.<module>.components`.",
        "",
        "_None._",
        "",
        "## Events",
        "",
        "Subscribe from `subscribers.ts`; subscribers run after the operation succeeded.",
        "",
        "_None._",
        "",
        "## Commands",
        "",
        "Add `before` hooks from `command-hooks.ts`.",
        "",
        "_None._",
        "",
        "## Better-auth paths",
        "",
        "Not GatoJS commands: hook them with a `before` or `after` hook in your module's `auth.ts` plugin.",
        "",
        ...TABLE_HEAD,
        "| `/organization/create` | organizations | stable | Create an organization |",
        "",
        "## Permissions",
        "",
        "Check with `can(context, key)`; change default roles under `modules.<module>.permissions`.",
        "",
        ...TABLE_HEAD,
        "| `uploads.delete-others` | uploads | stable | Delete files of others |",
        "| `uploads.view` | uploads | experimental | See files |",
        "",
      ].join("\n"),
    );
  });

  it("puts each kind under its own heading", () => {
    const row = (key: string) => ({
      key,
      module: "m",
      stability: "stable" as const,
      description: "d",
    });
    const lines = renderExtensionPointsMarkdown({
      modules: [row("m")],
      navItems: [row("m.nav")],
      slots: [row("m.slot")],
      components: [row("m.component")],
      events: [row("m.event")],
      commands: [row("m.command")],
      authPaths: [row("/p")],
      permissions: [row("m.permission")],
    }).split("\n");
    const rowAfter = (heading: string) => lines[lines.indexOf(heading) + 6];
    expect(rowAfter("## Modules")).toBe("| `m` | m | stable | d |");
    expect(rowAfter("## Nav items")).toBe("| `m.nav` | m | stable | d |");
    expect(rowAfter("## Slots")).toBe("| `m.slot` | m | stable | d |");
    expect(rowAfter("## Component handles")).toBe(
      "| `m.component` | m | stable | d |",
    );
    expect(rowAfter("## Events")).toBe("| `m.event` | m | stable | d |");
    expect(rowAfter("## Commands")).toBe("| `m.command` | m | stable | d |");
    expect(rowAfter("## Better-auth paths")).toBe("| `/p` | m | stable | d |");
    expect(rowAfter("## Permissions")).toBe(
      "| `m.permission` | m | stable | d |",
    );
    expect(lines).not.toContain("_None._");
  });

  it("writes a description with a quote and a backslash raw", () => {
    const markdown = renderExtensionPointsMarkdown({
      ...EMPTY,
      slots: [
        {
          key: "demo.panel",
          module: "demo",
          stability: "stable",
          description: 'Say "hi" \\ bye',
        },
      ],
    });
    expect(markdown.split("\n")).toContain(
      '| `demo.panel` | demo | stable | Say "hi" \\ bye |',
    );
  });

  it("ends with exactly one newline", () => {
    const markdown = renderExtensionPointsMarkdown(EMPTY);
    expect(markdown.endsWith("_None._\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});
