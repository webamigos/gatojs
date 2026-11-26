// @vitest-environment node
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ModuleDef } from "@/shared/lib/modules/define-module";
import type { GatoConfig, ModuleEntry } from "@/shared/lib/modules/gato-config";
import {
  CommandError,
  commandHookRegistry,
  defineCommand,
  defineCommandHooks,
  organizationScopedKeys,
  type CommandHook,
  type CommandHookMap,
} from "../define-command";

function moduleDef(key: string, commands?: readonly string[]): ModuleDef {
  if (commands === undefined) {
    return { key, nav: [], routePrefixes: [] };
  }
  return { key, nav: [], routePrefixes: [], commands };
}

function hook(id: string): CommandHook {
  return { id, before: () => undefined };
}

function thrown(build: () => unknown): Error {
  try {
    build();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected a throw");
}

function definition(key: string, module = "uploads") {
  return {
    key,
    module,
    access: "member" as const,
    input: z.object({ id: z.string() }),
    failureMessage: "Delete failed",
    run: async () => ({ success: true }),
  };
}

const UPLOADS = moduleDef("uploads", ["uploads.delete", "uploads.rename"]);
const INVOICES = moduleDef("invoices", ["invoices.issue"]);
const NOTES = moduleDef("notes");

function registry(
  hooks: readonly ModuleEntry<CommandHookMap>[],
  config: GatoConfig = {},
  modules: readonly ModuleDef[] = [UPLOADS, INVOICES, NOTES],
) {
  return commandHookRegistry({ modules, hooks }, config);
}

describe("defineCommand", () => {
  it("returns a frozen copy of the definition, not the definition itself", () => {
    const source = definition("uploads.delete");

    const command = defineCommand(source);

    expect(Object.isFrozen(command)).toBe(true);
    expect(command).not.toBe(source);
    expect(command).toEqual(source);
    expect(Object.isFrozen(source)).toBe(false);
  });

  it("a later change to the definition object does not reach the command", () => {
    const source = definition("uploads.delete");
    const command = defineCommand(source);

    source.failureMessage = "Changed";

    expect(command.failureMessage).toBe("Delete failed");
  });

  it.each([
    "delete",
    "uploads",
    "uploads.",
    "uploadsx.delete",
    "invoices.delete",
    ".delete",
    "Uploads.delete",
  ])("a key %j of module uploads throws the prefix CommandError", (key) => {
    const error = thrown(() => defineCommand(definition(key)));

    expect(error).toBeInstanceOf(CommandError);
    expect(error.name).toBe("CommandError");
    expect(error.message).toBe(
      `command keys must start with "uploads.": ${key}`,
    );
  });

  it("names the module of the definition in the prefix error", () => {
    expect(
      thrown(() => defineCommand(definition("delete", "invoices"))).message,
    ).toBe('command keys must start with "invoices.": delete');
  });

  it.each(["uploads.delete", "uploads.x", "uploads.delete-others"])(
    "accepts the key %j of module uploads",
    (key) => {
      expect(defineCommand(definition(key)).key).toBe(key);
    },
  );
});

describe("defineCommand: the key prefix rule", () => {
  const moduleKey = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);
  const suffix = fc.stringMatching(/^[a-z0-9.-]{1,12}$/);

  test.prop([moduleKey, suffix])(
    "accepts <module>.<anything non-empty> for any module",
    (module, rest) => {
      const key = `${module}.${rest}`;

      expect(defineCommand(definition(key, module)).key).toBe(key);
    },
  );

  test.prop([moduleKey, moduleKey, suffix])(
    "rejects a key that starts with another module's prefix",
    (module, other, rest) => {
      fc.pre(module !== other);
      const key = `${other}.${rest}`;

      expect(thrown(() => defineCommand(definition(key, module))).message).toBe(
        `command keys must start with "${module}.": ${key}`,
      );
    },
  );

  test.prop([moduleKey])(
    "rejects the bare module key and the module key with only a dot",
    (module) => {
      for (const key of [module, `${module}.`]) {
        expect(
          thrown(() => defineCommand(definition(key, module))).message,
        ).toBe(`command keys must start with "${module}.": ${key}`);
      }
    },
  );
});

describe("CommandError", () => {
  it("is an Error named CommandError", () => {
    const error = new CommandError("boom");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CommandError");
    expect(error.message).toBe("boom");
  });
});

describe("defineCommandHooks", () => {
  it("returns the same map", () => {
    const map = { "uploads.delete": hook("invoices.guard") };

    expect(defineCommandHooks(map)).toBe(map);
  });
});

describe("commandHookRegistry: validation", () => {
  it("builds an empty list with no hooks", () => {
    expect(registry([])).toEqual([]);
  });

  it("a hook on a key no module declares throws unknown command", () => {
    const error = thrown(() =>
      registry([
        { module: "invoices", value: { "uploads.nope": hook("invoices.a") } },
      ]),
    );

    expect(error).toBeInstanceOf(CommandError);
    expect(error.message).toBe("unknown command: uploads.nope");
  });

  it("reports an unknown command once even when two modules hook it", () => {
    const error = thrown(() =>
      registry([
        { module: "invoices", value: { "uploads.nope": hook("invoices.a") } },
        { module: "notes", value: { "uploads.nope": hook("notes.b") } },
      ]),
    );

    expect(error.message).toBe("unknown command: uploads.nope");
  });

  it("a command of a module disabled in the config is still a known key", () => {
    const archive = moduleDef("archive", ["archive.purge"]);

    const hooks = registry(
      [{ module: "invoices", value: { "archive.purge": hook("invoices.a") } }],
      { modules: { archive: { enabled: false } } },
      [UPLOADS, INVOICES, archive],
    );

    expect(hooks.map((entry) => entry.hook.id)).toEqual(["invoices.a"]);
  });

  it.each(["issue", "invoices.", "invoicesx.issue", "uploads.issue"])(
    "a declared command %j of module invoices throws the prefix problem",
    (key) => {
      const error = thrown(() =>
        registry([], {}, [moduleDef("invoices", [key])]),
      );

      expect(error).toBeInstanceOf(CommandError);
      expect(error.message).toBe(
        `command keys must start with "invoices.": ${key}`,
      );
    },
  );

  it("a command declared twice by one module throws duplicate command once", () => {
    const error = thrown(() =>
      registry([], {}, [
        moduleDef("invoices", ["invoices.issue", "invoices.issue"]),
      ]),
    );

    expect(error.message).toBe("duplicate command: invoices.issue");
  });

  it("a command declared three times is reported once", () => {
    const error = thrown(() =>
      registry([], {}, [
        moduleDef("invoices", [
          "invoices.issue",
          "invoices.issue",
          "invoices.issue",
        ]),
      ]),
    );

    expect(error.message).toBe("duplicate command: invoices.issue");
  });

  it("a hook id used three times is reported once", () => {
    const guard = hook("invoices.guard");

    const error = thrown(() =>
      registry([
        {
          module: "invoices",
          value: { "uploads.delete": guard, "uploads.rename": [guard, guard] },
        },
      ]),
    );

    expect(error.message).toBe("duplicate command hook: invoices.guard");
  });

  it("a command declared by two modules throws the prefix problem and then duplicate command", () => {
    const error = thrown(() =>
      registry([], {}, [UPLOADS, moduleDef("invoices", ["uploads.delete"])]),
    );

    expect(error.message).toBe(
      [
        'command keys must start with "invoices.": uploads.delete',
        "duplicate command: uploads.delete",
      ].join("\n"),
    );
  });

  it.each(["uploads.guard", "invoicesx.guard", "guard"])(
    "a hook id %j of module invoices throws the hook id prefix problem",
    (id) => {
      const error = thrown(() =>
        registry([
          { module: "invoices", value: { "uploads.delete": hook(id) } },
        ]),
      );

      expect(error.message).toBe(
        `command hook ids must start with "invoices.": ${id}`,
      );
    },
  );

  it("a hook id used on two commands throws duplicate command hook", () => {
    const guard = hook("invoices.guard");

    const error = thrown(() =>
      registry([
        {
          module: "invoices",
          value: { "uploads.delete": guard, "uploads.rename": guard },
        },
      ]),
    );

    expect(error.message).toBe("duplicate command hook: invoices.guard");
  });

  it("a hook id used in two entries of one module throws duplicate command hook", () => {
    const error = thrown(() =>
      registry([
        { module: "invoices", value: { "uploads.delete": hook("invoices.a") } },
        {
          module: "invoices",
          value: { "uploads.rename": hook("invoices.a") },
        },
      ]),
    );

    expect(error.message).toBe("duplicate command hook: invoices.a");
  });

  it("lists every problem in one CommandError, one per line, in the order of the checks", () => {
    const error = thrown(() =>
      registry(
        [
          {
            module: "notes",
            value: {
              "uploads.nope": hook("notes.a"),
              "uploads.delete": [hook("invoices.b"), hook("notes.a")],
            },
          },
        ],
        {},
        [
          UPLOADS,
          moduleDef("invoices", ["invoices.issue", "issue", "invoices.issue"]),
          NOTES,
        ],
      ),
    );

    expect(error).toBeInstanceOf(CommandError);
    expect(error.message).toBe(
      [
        'command keys must start with "invoices.": issue',
        "duplicate command: invoices.issue",
        'command hook ids must start with "notes.": invoices.b',
        "duplicate command hook: notes.a",
        "unknown command: uploads.nope",
      ].join("\n"),
    );
  });

  it("within one check, problems follow the module order, not an alphabetical one", () => {
    const error = thrown(() =>
      registry([], {}, [moduleDef("zeta", ["z1"]), moduleDef("alpha", ["a1"])]),
    );

    expect(error.message).toBe(
      [
        'command keys must start with "zeta.": z1',
        'command keys must start with "alpha.": a1',
      ].join("\n"),
    );
  });

  it("validates the hooks of a module disabled in the config: an unknown command still throws", () => {
    const error = thrown(() =>
      registry(
        [{ module: "invoices", value: { "uploads.nope": hook("invoices.a") } }],
        { modules: { invoices: { enabled: false } } },
      ),
    );

    expect(error.message).toBe("unknown command: uploads.nope");
  });

  it("validates the hooks of a module disabled in the config: a foreign hook id still throws", () => {
    const error = thrown(() =>
      registry(
        [{ module: "invoices", value: { "uploads.delete": hook("notes.a") } }],
        { modules: { invoices: { enabled: false } } },
      ),
    );

    expect(error.message).toBe(
      'command hook ids must start with "invoices.": notes.a',
    );
  });

  it("validates the commands of a module disabled in the config", () => {
    const error = thrown(() =>
      registry([], { modules: { invoices: { enabled: false } } }, [
        UPLOADS,
        moduleDef("invoices", ["issue"]),
      ]),
    );

    expect(error.message).toBe(
      'command keys must start with "invoices.": issue',
    );
  });
});

describe("commandHookRegistry: the flat list", () => {
  it("normalizes a single hook to one registered entry with its module and command", () => {
    const guard = hook("invoices.guard");

    const hooks = registry([
      { module: "invoices", value: { "uploads.delete": guard } },
    ]);

    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toEqual({
      module: "invoices",
      command: "uploads.delete",
      hook: guard,
    });
    expect(hooks[0]!.hook).toBe(guard);
  });

  it("keeps entry order, then key insertion order, then sorts a key's hooks by id code point", () => {
    const zetaLower = hook("zeta.b");
    const zetaUpper = hook("zeta.B");
    const zetaFirst = hook("zeta.a");
    const zetaRename = hook("zeta.c");
    const alpha = hook("alpha.x");

    const hooks = registry(
      [
        {
          module: "zeta",
          value: {
            "uploads.rename": zetaRename,
            "uploads.delete": [zetaLower, zetaUpper, zetaFirst],
          },
        },
        { module: "alpha", value: { "uploads.delete": alpha } },
      ],
      {},
      [UPLOADS, moduleDef("zeta"), moduleDef("alpha")],
    );

    expect(hooks).toEqual([
      { module: "zeta", command: "uploads.rename", hook: zetaRename },
      { module: "zeta", command: "uploads.delete", hook: zetaUpper },
      { module: "zeta", command: "uploads.delete", hook: zetaFirst },
      { module: "zeta", command: "uploads.delete", hook: zetaLower },
      { module: "alpha", command: "uploads.delete", hook: alpha },
    ]);
  });

  it("within a module ids m.b, m.a are listed m.a first", () => {
    const hooks = registry(
      [
        {
          module: "m",
          value: { "uploads.delete": [hook("m.b"), hook("m.a")] },
        },
      ],
      {},
      [UPLOADS, moduleDef("m")],
    );

    expect(hooks.map((entry) => entry.hook.id)).toEqual(["m.a", "m.b"]);
  });

  it("leaves out the hooks of a module disabled in the config and keeps the others", () => {
    const hooks = registry(
      [
        { module: "invoices", value: { "uploads.delete": hook("invoices.a") } },
        { module: "notes", value: { "uploads.delete": hook("notes.a") } },
      ],
      { modules: { invoices: { enabled: false } } },
    );

    expect(hooks.map((entry) => [entry.module, entry.hook.id])).toEqual([
      ["notes", "notes.a"],
    ]);
  });

  it("keeps every module's hooks when the config disables nothing", () => {
    const hooks = registry([
      { module: "invoices", value: { "uploads.delete": hook("invoices.a") } },
      { module: "notes", value: { "uploads.delete": hook("notes.a") } },
    ]);

    expect(hooks.map((entry) => entry.hook.id)).toEqual([
      "invoices.a",
      "notes.a",
    ]);
  });
});

describe("organizationScopedKeys", () => {
  it("lists organizationId and a field marked organizationScoped under optional", () => {
    expect(
      organizationScopedKeys(
        z.object({
          organizationId: z.string(),
          workspaceId: z.string().meta({ organizationScoped: true }).optional(),
          name: z.string(),
        }),
      ),
    ).toEqual(["organizationId", "workspaceId"]);
  });

  it("keeps the shape order", () => {
    expect(
      organizationScopedKeys(
        z.object({
          workspaceId: z.string().meta({ organizationScoped: true }),
          name: z.string(),
          organizationId: z.uuid().optional(),
        }),
      ),
    ).toEqual(["workspaceId", "organizationId"]);
  });

  it.each([
    ["optional", z.string().meta({ organizationScoped: true }).optional()],
    ["nullable", z.string().meta({ organizationScoped: true }).nullable()],
    ["default", z.string().meta({ organizationScoped: true }).default("x")],
    [
      "nullable then optional",
      z.string().meta({ organizationScoped: true }).nullable().optional(),
    ],
    [
      "the mark on the wrapper",
      z.string().optional().meta({ organizationScoped: true }),
    ],
  ])("finds the mark under %s", (_wrapper, field) => {
    expect(
      organizationScopedKeys(z.object({ teamId: field, name: z.string() })),
    ).toEqual(["teamId"]);
  });

  it.each([
    [
      "organizationScoped: false",
      z.string().meta({ organizationScoped: false }),
    ],
    ["another meta key", z.string().meta({ description: "team" })],
    ["no meta", z.string()],
  ])("ignores a field with %s", (_label, field) => {
    expect(organizationScopedKeys(z.object({ teamId: field }))).toEqual([]);
  });

  it("ignores a marked field nested inside an object field", () => {
    expect(
      organizationScopedKeys(
        z.object({
          nested: z.object({
            teamId: z.string().meta({ organizationScoped: true }),
          }),
        }),
      ),
    ).toEqual([]);
  });

  it("returns an empty list for an empty object", () => {
    expect(organizationScopedKeys(z.object({}))).toEqual([]);
  });

  test.prop([
    fc.uniqueArray(
      fc.record({
        key: fc
          .stringMatching(/^[a-z][a-zA-Z0-9]{0,11}$/)
          .filter((key) => key !== "organizationId"),
        marked: fc.boolean(),
      }),
      { selector: (field) => field.key, maxLength: 8 },
    ),
  ])(
    "lists exactly the marked keys in shape order, never an unmarked key",
    (fields) => {
      const shape = Object.fromEntries(
        fields.map(({ key, marked }) => [
          key,
          marked ? z.string().meta({ organizationScoped: true }) : z.string(),
        ]),
      );

      expect(organizationScopedKeys(z.object(shape))).toEqual(
        fields.filter((field) => field.marked).map((field) => field.key),
      );
    },
  );
});
