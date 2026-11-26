import { fc, test } from "@fast-check/vitest";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import type { ModuleDef } from "../define-module";
import {
  applyGatoConfig,
  GatoConfigError,
  gatoConfigProblems,
  type GatoConfig,
  type ModuleEntry,
} from "../gato-config";
import {
  componentConfigProblems,
  ComponentOverrideError,
  componentOverrideRegistry,
  defineComponentHandle,
  defineComponentOverride,
  type ComponentHandleDefinition,
  type ComponentOverride,
  type ComponentsModule,
  type OverrideMode,
} from "../component-overrides";

const INVITE = "users.invite-dialog";
const CONFIG_SOURCE = "src/gato.config.ts";

type Loader = () => Promise<{ default: ComponentType }>;

function loaderOf(): Loader {
  const Component: ComponentType = () => null;
  return () => Promise.resolve({ default: Component });
}

const crmLoader = loaderOf();
const invoicesLoader = loaderOf();
const notesLoader = loaderOf();
const configLoader = loaderOf();

function handle(id: string): ComponentHandleDefinition {
  return { id };
}

function override(
  handleId: string,
  mode: OverrideMode,
  component: Loader,
): ComponentOverride {
  return { handle: handleId, mode, component } as ComponentOverride;
}

function entry(
  module: string,
  value: ComponentsModule,
): ModuleEntry<ComponentsModule> {
  return { module, value };
}

function rawConfig(value: unknown): GatoConfig {
  return value as GatoConfig;
}

const usersHost = entry("users", { componentHandles: [handle(INVITE)] });
const crmReplace = entry("crm", {
  componentOverrides: [override(INVITE, "replace", crmLoader)],
});
const crmWrap = entry("crm", {
  componentOverrides: [override(INVITE, "wrap", crmLoader)],
});
const invoicesReplace = entry("invoices", {
  componentOverrides: [override(INVITE, "replace", invoicesLoader)],
});

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function overrideErrorLines(run: () => unknown): string[] {
  const error = thrownBy(run);
  expect(error).toBeInstanceOf(ComponentOverrideError);
  return (error as ComponentOverrideError).message.split("\n");
}

function configProblemsThrownBy(run: () => unknown): readonly string[] {
  const error = thrownBy(run);
  expect(error).toBeInstanceOf(GatoConfigError);
  return (error as GatoConfigError).problems;
}

function usersComponents(
  components: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): GatoConfig {
  return rawConfig({ modules: { users: { components }, ...extra } });
}

describe("defineComponentHandle", () => {
  it("returns an object with only the id", () => {
    const result = defineComponentHandle(INVITE);
    expect(result).toEqual({ id: "users.invite-dialog" });
    expect(Object.keys(result)).toEqual(["id"]);
  });

  it("an undeclared handle is a type error and still returns its id", () => {
    // @ts-expect-error users.nope is not in ComponentHandleMap
    expect(defineComponentHandle("users.nope")).toEqual({ id: "users.nope" });
  });
});

describe("defineComponentOverride", () => {
  it("replace returns the handle, mode replace and the same loader", () => {
    const loader = loaderOf();
    const result = defineComponentOverride(INVITE, { replace: loader });
    expect(result).toEqual({
      handle: "users.invite-dialog",
      mode: "replace",
      component: loader,
    });
    expect(result.component).toBe(loader);
    expect(Object.keys(result).sort()).toEqual(["component", "handle", "mode"]);
  });

  it("wrap returns the handle, mode wrap and the same loader", () => {
    const Wrapper: ComponentType<{ Base: ComponentType }> = () => null;
    const loader = () => Promise.resolve({ default: Wrapper });
    const result = defineComponentOverride(INVITE, { wrap: loader });
    expect(result).toEqual({
      handle: "users.invite-dialog",
      mode: "wrap",
      component: loader,
    });
    expect(result.component).toBe(loader);
    expect(Object.keys(result).sort()).toEqual(["component", "handle", "mode"]);
  });
});

describe("ComponentOverrideError", () => {
  it("is an Error whose name is the literal ComponentOverrideError", () => {
    const error = new ComponentOverrideError("x");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ComponentOverrideError");
    expect(error.message).toBe("x");
  });
});

describe("componentOverrideRegistry: result", () => {
  it("empty entries and an empty config give an empty map", () => {
    const result = componentOverrideRegistry([], {});
    expect(result.size).toBe(0);
  });

  it("a declared handle without any override has no entry", () => {
    const result = componentOverrideRegistry([usersHost, entry("crm", {})], {});
    expect(result.size).toBe(0);
    expect(result.has(INVITE)).toBe(false);
  });

  it("a crm replacement comes back with mode replace, the crm loader and source crm", () => {
    const result = componentOverrideRegistry([usersHost, crmReplace], {});
    expect([...result.entries()]).toEqual([
      [
        "users.invite-dialog",
        {
          handle: "users.invite-dialog",
          mode: "replace",
          component: crmLoader,
          source: "crm",
        },
      ],
    ]);
    expect(result.get(INVITE)?.component).toBe(crmLoader);
  });

  it("a crm wrapper comes back with mode wrap", () => {
    const result = componentOverrideRegistry([usersHost, crmWrap], {});
    expect(result.get(INVITE)).toEqual({
      handle: "users.invite-dialog",
      mode: "wrap",
      component: crmLoader,
      source: "crm",
    });
  });

  it("an override registered before its host module still applies", () => {
    const result = componentOverrideRegistry([crmReplace, usersHost], {});
    expect(result.get(INVITE)?.source).toBe("crm");
    expect(result.get(INVITE)?.component).toBe(crmLoader);
  });

  it("an override of a handle whose host module is disabled is not unknown and still applies", () => {
    const result = componentOverrideRegistry([usersHost, crmReplace], {
      modules: { users: { enabled: false } },
    });
    expect(result.get(INVITE)?.source).toBe("crm");
  });

  it("only crm overrides and crm is disabled: no entry", () => {
    const result = componentOverrideRegistry([usersHost, crmReplace], {
      modules: { crm: { enabled: false } },
    });
    expect(result.size).toBe(0);
  });

  it("each handle gets the override aimed at it, not one aimed at another handle", () => {
    const panelLoader = loaderOf();
    const result = componentOverrideRegistry(
      [
        entry("users", {
          componentHandles: [handle(INVITE), handle("users.panel")],
        }),
        entry("crm", {
          componentOverrides: [
            override("users.panel", "wrap", panelLoader),
            override(INVITE, "replace", crmLoader),
          ],
        }),
      ],
      {},
    );
    expect(result.get(INVITE)).toEqual({
      handle: "users.invite-dialog",
      mode: "replace",
      component: crmLoader,
      source: "crm",
    });
    expect(result.get("users.panel")).toEqual({
      handle: "users.panel",
      mode: "wrap",
      component: panelLoader,
      source: "crm",
    });
  });
});

describe("componentOverrideRegistry: conflicts", () => {
  it("crm and invoices both overriding users.invite-dialog throw naming both and the owner's config key", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry([usersHost, crmReplace, invoicesReplace], {}),
      ),
    ).toEqual([
      "users.invite-dialog is overridden by both crm and invoices; choose one under modules.users.components in src/gato.config.ts",
    ]);
  });

  it("names the overriding modules in registry order", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry([usersHost, invoicesReplace, crmReplace], {}),
      ),
    ).toEqual([
      "users.invite-dialog is overridden by both invoices and crm; choose one under modules.users.components in src/gato.config.ts",
    ]);
  });

  it("three overriding modules are all named, joined by and", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [
            usersHost,
            crmReplace,
            invoicesReplace,
            entry("notes", {
              componentOverrides: [override(INVITE, "wrap", notesLoader)],
            }),
          ],
          {},
        ),
      ),
    ).toEqual([
      "users.invite-dialog is overridden by both crm and invoices and notes; choose one under modules.users.components in src/gato.config.ts",
    ]);
  });

  it("the message points to the config key of the module that declares the handle", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [
            entry("notes", { componentHandles: [handle("notes.panel")] }),
            entry("crm", {
              componentOverrides: [
                override("notes.panel", "replace", crmLoader),
              ],
            }),
            entry("invoices", {
              componentOverrides: [
                override("notes.panel", "replace", invoicesLoader),
              ],
            }),
          ],
          {},
        ),
      ),
    ).toEqual([
      "notes.panel is overridden by both crm and invoices; choose one under modules.notes.components in src/gato.config.ts",
    ]);
  });

  it("two conflicting handles give one error with one line per handle", () => {
    const lines = overrideErrorLines(() =>
      componentOverrideRegistry(
        [
          entry("users", {
            componentHandles: [handle(INVITE), handle("users.panel")],
          }),
          entry("crm", {
            componentOverrides: [
              override(INVITE, "replace", crmLoader),
              override("users.panel", "replace", crmLoader),
            ],
          }),
          entry("invoices", {
            componentOverrides: [
              override(INVITE, "replace", invoicesLoader),
              override("users.panel", "wrap", invoicesLoader),
            ],
          }),
        ],
        {},
      ),
    );
    expect(lines).toHaveLength(2);
    expect(lines).toContain(
      "users.invite-dialog is overridden by both crm and invoices; choose one under modules.users.components in src/gato.config.ts",
    );
    expect(lines).toContain(
      "users.panel is overridden by both crm and invoices; choose one under modules.users.components in src/gato.config.ts",
    );
  });

  it("with invoices disabled there is no conflict and crm's override applies", () => {
    const result = componentOverrideRegistry(
      [usersHost, crmReplace, invoicesReplace],
      { modules: { invoices: { enabled: false } } },
    );
    expect(result.get(INVITE)).toEqual({
      handle: "users.invite-dialog",
      mode: "replace",
      component: crmLoader,
      source: "crm",
    });
  });

  it("with crm disabled there is no conflict and invoices' override applies", () => {
    const result = componentOverrideRegistry(
      [usersHost, crmReplace, invoicesReplace],
      { modules: { crm: { enabled: false } } },
    );
    expect(result.get(INVITE)?.source).toBe("invoices");
    expect(result.get(INVITE)?.component).toBe(invoicesLoader);
  });

  it("config module invoices picks invoices' override", () => {
    const result = componentOverrideRegistry(
      [usersHost, crmReplace, invoicesReplace],
      usersComponents({ [INVITE]: { module: "invoices" } }),
    );
    expect(result.get(INVITE)).toEqual({
      handle: "users.invite-dialog",
      mode: "replace",
      component: invoicesLoader,
      source: "invoices",
    });
  });

  it("config module crm picks crm's override", () => {
    const result = componentOverrideRegistry(
      [usersHost, invoicesReplace, crmWrap],
      usersComponents({ [INVITE]: { module: "crm" } }),
    );
    expect(result.get(INVITE)).toEqual({
      handle: "users.invite-dialog",
      mode: "wrap",
      component: crmLoader,
      source: "crm",
    });
  });

  it("config replace wins over two module overrides and has source src/gato.config.ts", () => {
    const result = componentOverrideRegistry(
      [usersHost, crmReplace, invoicesReplace],
      usersComponents({ [INVITE]: { replace: configLoader } }),
    );
    expect(result.get(INVITE)).toEqual({
      handle: "users.invite-dialog",
      mode: "replace",
      component: configLoader,
      source: CONFIG_SOURCE,
    });
    expect(result.get(INVITE)?.component).toBe(configLoader);
  });

  it("config null resolves a conflict and leaves the core component", () => {
    const result = componentOverrideRegistry(
      [usersHost, crmReplace, invoicesReplace],
      usersComponents({ [INVITE]: null }),
    );
    expect(result.size).toBe(0);
  });
});

describe("componentOverrideRegistry: the config", () => {
  it("config null removes a single module override", () => {
    const result = componentOverrideRegistry(
      [usersHost, crmReplace],
      usersComponents({ [INVITE]: null }),
    );
    expect(result.has(INVITE)).toBe(false);
    expect(result.size).toBe(0);
  });

  it("config wrap wins over one module override", () => {
    const result = componentOverrideRegistry(
      [usersHost, crmReplace],
      usersComponents({ [INVITE]: { wrap: configLoader } }),
    );
    expect(result.get(INVITE)).toEqual({
      handle: "users.invite-dialog",
      mode: "wrap",
      component: configLoader,
      source: "src/gato.config.ts",
    });
  });

  it("config replace applies to a handle no module overrides", () => {
    const result = componentOverrideRegistry(
      [usersHost],
      usersComponents({ [INVITE]: { replace: configLoader } }),
    );
    expect([...result.entries()]).toEqual([
      [
        "users.invite-dialog",
        {
          handle: "users.invite-dialog",
          mode: "replace",
          component: configLoader,
          source: "src/gato.config.ts",
        },
      ],
    ]);
  });

  it("config replace applies while the host module is disabled", () => {
    const result = componentOverrideRegistry(
      [usersHost],
      rawConfig({
        modules: {
          users: {
            enabled: false,
            components: { [INVITE]: { replace: configLoader } },
          },
        },
      }),
    );
    expect(result.get(INVITE)?.source).toBe("src/gato.config.ts");
  });

  it("config module crm with crm disabled throws GatoConfigError", () => {
    expect(
      configProblemsThrownBy(() =>
        componentOverrideRegistry(
          [usersHost, crmReplace],
          rawConfig({
            modules: {
              users: { components: { [INVITE]: { module: "crm" } } },
              crm: { enabled: false },
            },
          }),
        ),
      ),
    ).toEqual([
      "modules.users.components.users.invite-dialog.module: crm has no enabled override of users.invite-dialog",
    ]);
  });

  it("two config problems throw one GatoConfigError listing both", () => {
    const error = thrownBy(() =>
      componentOverrideRegistry(
        [usersHost, crmReplace],
        usersComponents({ "users.nope": null, [INVITE]: { replace: "x" } }),
      ),
    );
    expect(error).toBeInstanceOf(GatoConfigError);
    expect((error as Error).name).toBe("GatoConfigError");
    expect((error as GatoConfigError).problems).toEqual([
      "modules.users.components.users.nope: unknown component handle: users.nope",
      'modules.users.components.users.invite-dialog.replace: must be a lazy import, () => import("…")',
    ]);
  });

  it("a config problem is thrown before a conflict is checked", () => {
    const error = thrownBy(() =>
      componentOverrideRegistry(
        [usersHost, crmReplace, invoicesReplace],
        usersComponents({ "users.nope": null }),
      ),
    );
    expect(error).toBeInstanceOf(GatoConfigError);
    expect((error as GatoConfigError).problems).toEqual([
      "modules.users.components.users.nope: unknown component handle: users.nope",
    ]);
  });

  it("a structural problem is thrown before a config problem: ComponentOverrideError, not GatoConfigError", () => {
    const error = thrownBy(() =>
      componentOverrideRegistry(
        [
          usersHost,
          entry("crm", {
            componentOverrides: [override("users.nope", "replace", crmLoader)],
          }),
        ],
        usersComponents({ "users.other": null }),
      ),
    );
    expect(error).toBeInstanceOf(ComponentOverrideError);
    expect(error).not.toBeInstanceOf(GatoConfigError);
    expect((error as Error).name).toBe("ComponentOverrideError");
  });
});

describe("componentOverrideRegistry: ComponentOverrideError", () => {
  it("users declaring crm.card is told handles must start with users.", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [entry("users", { componentHandles: [handle("crm.card")] })],
          {},
        ),
      ),
    ).toEqual(['component handles must start with "users.": crm.card']);
  });

  it("a handle that starts with the module name but not with its dot is reported", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [entry("users", { componentHandles: [handle("usersx.card")] })],
          {},
        ),
      ),
    ).toEqual(['component handles must start with "users.": usersx.card']);
  });

  it("a handle without any dot is reported", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [entry("users", { componentHandles: [handle("users")] })],
          {},
        ),
      ),
    ).toEqual(['component handles must start with "users.": users']);
  });

  it("a handle declared twice by users is a duplicate naming users twice", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [
            entry("users", {
              componentHandles: [handle(INVITE), handle(INVITE)],
            }),
          ],
          {},
        ),
      ),
    ).toEqual([
      "duplicate component handle: users.invite-dialog (declared by users and users)",
    ]);
  });

  it("a handle declared by users and then by crm names both owners in declaration order", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [usersHost, entry("crm", { componentHandles: [handle(INVITE)] })],
          {},
        ),
      ),
    ).toEqual([
      'component handles must start with "crm.": users.invite-dialog',
      "duplicate component handle: users.invite-dialog (declared by users and crm)",
    ]);
  });

  it("a handle declared by crm and then by users names crm first", () => {
    const lines = overrideErrorLines(() =>
      componentOverrideRegistry(
        [entry("crm", { componentHandles: [handle(INVITE)] }), usersHost],
        {},
      ),
    );
    expect(lines).toContain(
      "duplicate component handle: users.invite-dialog (declared by crm and users)",
    );
  });

  it("an override of users.nope is an unknown handle naming the overriding module", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [
            usersHost,
            entry("crm", {
              componentOverrides: [
                override("users.nope", "replace", crmLoader),
              ],
            }),
          ],
          {},
        ),
      ),
    ).toEqual(["unknown component handle: users.nope (overridden by crm)"]);
  });

  it("an override of users.nope from a disabled module still throws", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [
            usersHost,
            entry("crm", {
              componentOverrides: [override("users.nope", "wrap", crmLoader)],
            }),
          ],
          { modules: { crm: { enabled: false } } },
        ),
      ),
    ).toEqual(["unknown component handle: users.nope (overridden by crm)"]);
  });

  it("a duplicate handle in a disabled module still throws", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [
            entry("users", {
              componentHandles: [handle(INVITE), handle(INVITE)],
            }),
          ],
          { modules: { users: { enabled: false } } },
        ),
      ),
    ).toEqual([
      "duplicate component handle: users.invite-dialog (declared by users and users)",
    ]);
  });

  it("several structural problems: one error, lines in the order of the checks", () => {
    expect(
      overrideErrorLines(() =>
        componentOverrideRegistry(
          [
            entry("crm", {
              componentOverrides: [
                override("users.nope", "replace", crmLoader),
              ],
            }),
            entry("users", {
              componentHandles: [handle(INVITE), handle(INVITE)],
            }),
            entry("notes", { componentHandles: [handle("panel")] }),
          ],
          {},
        ),
      ),
    ).toEqual([
      'component handles must start with "notes.": panel',
      "duplicate component handle: users.invite-dialog (declared by users and users)",
      "unknown component handle: users.nope (overridden by crm)",
    ]);
  });

  it("an entry with neither componentHandles nor componentOverrides is accepted", () => {
    expect(
      componentOverrideRegistry([entry("empty", {}), usersHost], {}).size,
    ).toBe(0);
  });
});

describe("componentConfigProblems", () => {
  const entries = [usersHost, crmReplace, entry("invoices", {})];
  const withPanel = [
    entry("users", {
      componentHandles: [handle(INVITE), handle("users.panel")],
    }),
    crmReplace,
    entry("notes", {
      componentOverrides: [override("users.panel", "replace", notesLoader)],
    }),
  ];

  it("returns an empty list for an empty config", () => {
    expect(componentConfigProblems(entries, {})).toEqual([]);
  });

  it("returns an empty list for modules without components", () => {
    expect(
      componentConfigProblems(entries, {
        modules: { users: { enabled: true }, crm: { enabled: false } },
      }),
    ).toEqual([]);
  });

  it("returns an empty list for null, replace, wrap and module on declared handles", () => {
    expect(
      componentConfigProblems(entries, usersComponents({ [INVITE]: null })),
    ).toEqual([]);
    expect(
      componentConfigProblems(
        entries,
        usersComponents({ [INVITE]: { replace: configLoader } }),
      ),
    ).toEqual([]);
    expect(
      componentConfigProblems(
        entries,
        usersComponents({ [INVITE]: { wrap: configLoader } }),
      ),
    ).toEqual([]);
    expect(
      componentConfigProblems(
        entries,
        usersComponents({ [INVITE]: { module: "crm" } }),
      ),
    ).toEqual([]);
  });

  it("users.nope under users is an unknown component handle", () => {
    expect(
      componentConfigProblems(entries, usersComponents({ "users.nope": null })),
    ).toEqual([
      "modules.users.components.users.nope: unknown component handle: users.nope",
    ]);
  });

  it("a handle named under a module that does not declare it is unknown", () => {
    expect(
      componentConfigProblems(
        entries,
        rawConfig({ modules: { crm: { components: { [INVITE]: null } } } }),
      ),
    ).toEqual([
      "modules.crm.components.users.invite-dialog: unknown component handle: users.invite-dialog",
    ]);
  });

  it("a handle under a module key with no entry at all is unknown", () => {
    expect(
      componentConfigProblems(
        entries,
        rawConfig({
          modules: { billing: { components: { "billing.card": null } } },
        }),
      ),
    ).toEqual([
      "modules.billing.components.billing.card: unknown component handle: billing.card",
    ]);
  });

  it("a declaration of a disabled host module still counts", () => {
    expect(
      componentConfigProblems(
        entries,
        rawConfig({
          modules: {
            users: { enabled: false, components: { [INVITE]: null } },
          },
        }),
      ),
    ).toEqual([]);
  });

  it("modules.app.components is skipped: gatoConfigProblems reports it", () => {
    expect(
      componentConfigProblems(
        entries,
        rawConfig({ modules: { app: { components: { "app.x": null } } } }),
      ),
    ).toEqual([]);
  });

  it.each([
    ["an empty object", {}],
    [
      "replace and wrap together",
      { replace: configLoader, wrap: configLoader },
    ],
    ["replace and module together", { replace: configLoader, module: "crm" }],
    ["replace and an unknown key", { replace: configLoader, priority: 1 }],
    ["only an unknown key", { component: configLoader }],
    ["a string", "crm"],
    ["a number", 1],
    ["a bare loader", configLoader],
  ])(
    "%s is told to set exactly one of replace, wrap or module",
    (_label, value) => {
      expect(
        componentConfigProblems(entries, usersComponents({ [INVITE]: value })),
      ).toEqual([
        "modules.users.components.users.invite-dialog: set exactly one of replace, wrap or module, or null",
      ]);
    },
  );

  it("replace that is not a function is told to be a lazy import", () => {
    expect(
      componentConfigProblems(
        entries,
        usersComponents({ [INVITE]: { replace: "x" } }),
      ),
    ).toEqual([
      'modules.users.components.users.invite-dialog.replace: must be a lazy import, () => import("…")',
    ]);
  });

  it("wrap that is not a function names wrap in the problem", () => {
    expect(
      componentConfigProblems(
        entries,
        usersComponents({ [INVITE]: { wrap: 42 } }),
      ),
    ).toEqual([
      'modules.users.components.users.invite-dialog.wrap: must be a lazy import, () => import("…")',
    ]);
  });

  it("replace null is not a lazy import", () => {
    expect(
      componentConfigProblems(
        entries,
        usersComponents({ [INVITE]: { replace: null } }),
      ),
    ).toEqual([
      'modules.users.components.users.invite-dialog.replace: must be a lazy import, () => import("…")',
    ]);
  });

  it("module crm with crm disabled has no enabled override", () => {
    expect(
      componentConfigProblems(
        entries,
        rawConfig({
          modules: {
            users: { components: { [INVITE]: { module: "crm" } } },
            crm: { enabled: false },
          },
        }),
      ),
    ).toEqual([
      "modules.users.components.users.invite-dialog.module: crm has no enabled override of users.invite-dialog",
    ]);
  });

  it("module invoices without any override has no enabled override", () => {
    expect(
      componentConfigProblems(
        entries,
        usersComponents({ [INVITE]: { module: "invoices" } }),
      ),
    ).toEqual([
      "modules.users.components.users.invite-dialog.module: invoices has no enabled override of users.invite-dialog",
    ]);
  });

  it("module ghost that is not a registered module has no enabled override", () => {
    expect(
      componentConfigProblems(
        entries,
        usersComponents({ [INVITE]: { module: "ghost" } }),
      ),
    ).toEqual([
      "modules.users.components.users.invite-dialog.module: ghost has no enabled override of users.invite-dialog",
    ]);
  });

  it("module notes that overrides only another handle has no enabled override of this one", () => {
    expect(
      componentConfigProblems(
        withPanel,
        usersComponents({ [INVITE]: { module: "notes" } }),
      ),
    ).toEqual([
      "modules.users.components.users.invite-dialog.module: notes has no enabled override of users.invite-dialog",
    ]);
  });

  it("module notes for the handle notes does override is accepted", () => {
    expect(
      componentConfigProblems(
        withPanel,
        usersComponents({ "users.panel": { module: "notes" } }),
      ),
    ).toEqual([]);
  });

  it("lists problems in config key order", () => {
    expect(
      componentConfigProblems(
        entries,
        rawConfig({
          modules: {
            crm: { components: { "crm.nope": null } },
            users: {
              components: {
                "users.nope": null,
                [INVITE]: {},
              },
            },
          },
        }),
      ),
    ).toEqual([
      "modules.crm.components.crm.nope: unknown component handle: crm.nope",
      "modules.users.components.users.nope: unknown component handle: users.nope",
      "modules.users.components.users.invite-dialog: set exactly one of replace, wrap or module, or null",
    ]);
  });

  const suffix = fc.stringMatching(/^[a-z][a-z-]{0,9}$/);

  test.prop([suffix.filter((value) => value !== "invite-dialog")])(
    "a users handle other than the declared one is always reported as unknown",
    (name) => {
      expect(
        componentConfigProblems(
          entries,
          usersComponents({ [`users.${name}`]: null }),
        ),
      ).toEqual([
        `modules.users.components.users.${name}: unknown component handle: users.${name}`,
      ]);
    },
  );

  test.prop([fc.uniqueArray(suffix, { minLength: 1, maxLength: 6 })])(
    "null for every declared handle gives no problem and no entry even when crm overrides each",
    (names) => {
      const ids = names.map((name) => `users.${name}`);
      const declared = [
        entry("users", { componentHandles: ids.map(handle) }),
        entry("crm", {
          componentOverrides: ids.map((id) =>
            override(id, "replace", crmLoader),
          ),
        }),
      ];
      const config = usersComponents(
        Object.fromEntries(ids.map((id) => [id, null])),
      );
      expect(componentConfigProblems(declared, config)).toEqual([]);
      expect(componentOverrideRegistry(declared, config).size).toBe(0);
    },
  );

  test.prop([fc.uniqueArray(suffix, { minLength: 1, maxLength: 6 })])(
    "one enabled override per handle gives one entry per handle with source crm",
    (names) => {
      const ids = names.map((name) => `users.${name}`);
      const result = componentOverrideRegistry(
        [
          entry("users", { componentHandles: ids.map(handle) }),
          entry("crm", {
            componentOverrides: ids.map((id) =>
              override(id, "wrap", crmLoader),
            ),
          }),
        ],
        {},
      );
      expect([...result.keys()].sort()).toEqual([...ids].sort());
      for (const id of ids) {
        expect(result.get(id)?.source).toBe("crm");
        expect(result.get(id)?.handle).toBe(id);
      }
    },
  );
});

describe("gato-config leaves components to the client registry", () => {
  const usersModule: ModuleDef = {
    key: "users",
    nav: [],
    routePrefixes: ["/users"],
  };

  it("gatoConfigProblems does not validate modules.users.components", () => {
    expect(
      gatoConfigProblems(
        [usersModule],
        usersComponents({ "users.nope": { replace: "x" } }),
      ),
    ).toEqual([]);
  });

  it("applyGatoConfig ignores modules.users.components", () => {
    expect(
      applyGatoConfig(
        [usersModule],
        usersComponents({ [INVITE]: { replace: configLoader } }),
      ),
    ).toEqual([usersModule]);
  });

  it("modules.app.components stays the reserved-key problem", () => {
    expect(
      gatoConfigProblems(
        [usersModule],
        rawConfig({ modules: { app: { components: { "app.x": null } } } }),
      ),
    ).toEqual([
      "modules.app.components: app is reserved for core-hosted slots; only slots is allowed",
    ]);
  });
});
