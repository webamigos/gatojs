import { fc, test } from "@fast-check/vitest";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import type { OrgRole, UserRole } from "@/shared/lib/auth/roles";
import {
  CORE_SLOTS_CONFIG_KEY,
  GatoConfigError,
  type GatoConfig,
  type ModuleEntry,
} from "../gato-config";
import {
  clientSlotRegistry,
  coreSlotDefinitions,
  defineContribution,
  defineSlot,
  roleAllows,
  slotConfigProblems,
  SlotError,
  slotRegistry,
  sortContributions,
  type ClientSlotModule,
  type SlotContribution,
  type SlotDefinition,
  type SlotModule,
} from "../slots";

const Card: ComponentType<{ organizationId: string }> = () => null;
const loader = () => Promise.resolve({ default: Card });

function contribution(
  slot: string,
  id: string,
  priority: number,
  roles?: readonly OrgRole[],
): SlotContribution {
  return { slot, id, priority, roles, component: loader } as SlotContribution;
}

function server(id: string): SlotDefinition {
  return { id, kind: "server" };
}

function client(id: string): SlotDefinition {
  return { id, kind: "client" };
}

function slotsEntry(
  module: string,
  value: SlotModule,
): ModuleEntry<SlotModule> {
  return { module, value };
}

function clientEntry(
  module: string,
  value: ClientSlotModule,
): ModuleEntry<ClientSlotModule> {
  return { module, value };
}

const dashboardHost = slotsEntry("dashboard", {
  slotDefinitions: [server("dashboard.sections")],
});

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function slotErrorMessage(run: () => unknown): string {
  const error = thrownBy(run);
  expect(error).toBeInstanceOf(SlotError);
  return (error as SlotError).message;
}

function viewer(userRole: UserRole, orgRole: OrgRole | null) {
  return { userRole, orgRole };
}

describe("defineSlot", () => {
  it("returns the id and the kind of a server slot", () => {
    expect(defineSlot("dashboard.sections", { kind: "server" })).toEqual({
      id: "dashboard.sections",
      kind: "server",
    });
  });

  it("returns the id and the kind of a client slot", () => {
    expect(defineSlot("account.sections", { kind: "client" })).toEqual({
      id: "account.sections",
      kind: "client",
    });
  });
});

describe("defineContribution", () => {
  it("returns the slot, id, priority, roles and the same loader", () => {
    const result = defineContribution("dashboard.sections", {
      id: "invoices.unpaid-card",
      priority: 20,
      roles: ["owner", "admin"],
      component: loader,
    });
    expect(result).toEqual({
      slot: "dashboard.sections",
      id: "invoices.unpaid-card",
      priority: 20,
      roles: ["owner", "admin"],
      component: loader,
    });
    expect(result.component).toBe(loader);
  });

  it("leaves roles undefined when the contribution sets none", () => {
    const result = defineContribution("dashboard.sections", {
      id: "invoices.unpaid-card",
      priority: 10,
      component: loader,
    });
    expect(result.roles).toBeUndefined();
    expect(result.slot).toBe("dashboard.sections");
  });
});

describe("coreSlotDefinitions", () => {
  it("declares only app.header.actions as a server slot", () => {
    expect(coreSlotDefinitions).toEqual([
      { id: "app.header.actions", kind: "server" },
    ]);
  });

  it("core slots are configured under the reserved key app", () => {
    expect(CORE_SLOTS_CONFIG_KEY).toBe("app");
  });
});

describe("sortContributions", () => {
  it("a (20), b (10), c (10) give b, c, a", () => {
    const sorted = sortContributions([
      contribution("dashboard.sections", "a", 20),
      contribution("dashboard.sections", "b", 10),
      contribution("dashboard.sections", "c", 10),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by priority ascending, not descending", () => {
    const sorted = sortContributions([
      contribution("dashboard.sections", "m.high", 100),
      contribution("dashboard.sections", "m.low", 1),
      contribution("dashboard.sections", "m.mid", 50),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["m.low", "m.mid", "m.high"]);
  });

  it("equal priorities are ordered by id in code point order, x.B before x.a", () => {
    const sorted = sortContributions([
      contribution("dashboard.sections", "x.a", 10),
      contribution("dashboard.sections", "x.B", 10),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["x.B", "x.a"]);
  });

  it("equal priorities ignore the registry order: m.z registered before m.y still comes after it", () => {
    const sorted = sortContributions([
      contribution("dashboard.sections", "m.z", 10),
      contribution("dashboard.sections", "m.y", 10),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["m.y", "m.z"]);
  });

  it("negative and zero priorities come before positive ones", () => {
    const sorted = sortContributions([
      contribution("dashboard.sections", "m.a", 0),
      contribution("dashboard.sections", "m.b", -5),
      contribution("dashboard.sections", "m.c", 3),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["m.b", "m.a", "m.c"]);
  });

  it("returns a new array and leaves the input order untouched", () => {
    const input = [
      contribution("dashboard.sections", "a", 20),
      contribution("dashboard.sections", "b", 10),
    ];
    const sorted = sortContributions(input);
    expect(sorted).not.toBe(input);
    expect(input.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("keeps the extra fields of each item", () => {
    const registered = {
      ...contribution("dashboard.sections", "m.a", 1),
      module: "m",
      kind: "server" as const,
    };
    expect(sortContributions([registered])).toEqual([registered]);
  });

  const items = fc.uniqueArray(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 6 }),
      priority: fc.integer({ min: -50, max: 50 }),
    }),
    { selector: (item) => item.id, maxLength: 12 },
  );

  test.prop([items])(
    "the result holds the same ids with non-decreasing priorities",
    (raw) => {
      const sorted = sortContributions(
        raw.map((item) =>
          contribution("dashboard.sections", item.id, item.priority),
        ),
      );
      expect(sorted.map((item) => item.id).sort()).toEqual(
        raw.map((item) => item.id).sort(),
      );
      for (let index = 1; index < sorted.length; index += 1) {
        expect(sorted[index - 1].priority).toBeLessThanOrEqual(
          sorted[index].priority,
        );
      }
    },
  );

  test.prop([items])("the result does not depend on the input order", (raw) => {
    const forward = sortContributions(
      raw.map((item) =>
        contribution("dashboard.sections", item.id, item.priority),
      ),
    );
    const backward = sortContributions(
      [...raw]
        .reverse()
        .map((item) =>
          contribution("dashboard.sections", item.id, item.priority),
        ),
    );
    expect(backward.map((item) => item.id)).toEqual(
      forward.map((item) => item.id),
    );
  });

  test.prop([items])("sorting twice changes nothing", (raw) => {
    const once = sortContributions(
      raw.map((item) =>
        contribution("dashboard.sections", item.id, item.priority),
      ),
    );
    expect(sortContributions(once).map((item) => item.id)).toEqual(
      once.map((item) => item.id),
    );
  });
});

describe("roleAllows", () => {
  const ownerOnly = { roles: ["owner"] as const };

  it("a contribution without roles is shown to a member", () => {
    expect(roleAllows({}, viewer("user", "member"))).toBe(true);
  });

  it("a contribution without roles is shown even without an org role", () => {
    expect(roleAllows({}, viewer("user", null))).toBe(true);
  });

  it("roles owner hides it from a member", () => {
    expect(roleAllows(ownerOnly, viewer("user", "member"))).toBe(false);
  });

  it("roles owner hides it from an org admin", () => {
    expect(roleAllows(ownerOnly, viewer("user", "admin"))).toBe(false);
  });

  it("roles owner shows it to an owner", () => {
    expect(roleAllows(ownerOnly, viewer("user", "owner"))).toBe(true);
  });

  it("roles owner hides it from a user without an org role", () => {
    expect(roleAllows(ownerOnly, viewer("user", null))).toBe(false);
  });

  it("roles owner shows it to a global admin without an org role", () => {
    expect(roleAllows(ownerOnly, viewer("admin", null))).toBe(true);
  });

  it("roles owner shows it to a superadmin without an org role", () => {
    expect(roleAllows(ownerOnly, viewer("superadmin", null))).toBe(true);
  });

  it("roles owner shows it to a global admin who is a member", () => {
    expect(roleAllows(ownerOnly, viewer("admin", "member"))).toBe(true);
  });

  it("roles owner and admin show it to an org admin", () => {
    expect(
      roleAllows({ roles: ["owner", "admin"] }, viewer("user", "admin")),
    ).toBe(true);
  });

  it("an empty roles list hides it from an owner", () => {
    expect(roleAllows({ roles: [] }, viewer("user", "owner"))).toBe(false);
  });

  it("an empty roles list still shows it to a global admin", () => {
    expect(roleAllows({ roles: [] }, viewer("admin", "member"))).toBe(true);
  });

  it("an empty roles list still shows it to a superadmin without an org role", () => {
    expect(roleAllows({ roles: [] }, viewer("superadmin", null))).toBe(true);
  });
});

describe("slotRegistry: order and shape", () => {
  it("contributions a (20), b (10), c (10) come out as b, c, a", () => {
    const result = slotRegistry(
      {
        slots: [
          dashboardHost,
          slotsEntry("m", {
            slots: [
              contribution("dashboard.sections", "m.a", 20),
              contribution("dashboard.sections", "m.b", 10),
              contribution("dashboard.sections", "m.c", 10),
            ],
          }),
        ],
        clientSlots: [],
      },
      {},
    );
    expect(result.map((item) => item.id)).toEqual(["m.b", "m.c", "m.a"]);
  });

  it("equal priorities from the registry order m.z, m.y come out as m.y, m.z", () => {
    const result = slotRegistry(
      {
        slots: [
          dashboardHost,
          slotsEntry("m", {
            slots: [
              contribution("dashboard.sections", "m.z", 10),
              contribution("dashboard.sections", "m.y", 10),
            ],
          }),
        ],
        clientSlots: [],
      },
      {},
    );
    expect(result.map((item) => item.id)).toEqual(["m.y", "m.z"]);
  });

  it("returns each contribution with its module and the slot kind", () => {
    const result = slotRegistry(
      {
        slots: [
          dashboardHost,
          slotsEntry("invoices", {
            slots: [
              contribution("dashboard.sections", "invoices.unpaid-card", 20, [
                "owner",
              ]),
            ],
          }),
        ],
        clientSlots: [],
      },
      {},
    );
    expect(result).toEqual([
      {
        slot: "dashboard.sections",
        id: "invoices.unpaid-card",
        priority: 20,
        roles: ["owner"],
        component: loader,
        module: "invoices",
        kind: "server",
      },
    ]);
  });

  it("a contribution to the core slot app.header.actions is accepted as a server contribution", () => {
    const result = slotRegistry(
      {
        slots: [
          slotsEntry("m", {
            slots: [contribution("app.header.actions", "m.action", 1)],
          }),
        ],
        clientSlots: [],
      },
      {},
    );
    expect(
      result.map((item) => [item.module, item.id, item.slot, item.kind]),
    ).toEqual([["m", "m.action", "app.header.actions", "server"]]);
  });

  it("a client-slots.ts contribution to a client slot comes out with kind client", () => {
    const result = slotRegistry(
      {
        slots: [
          slotsEntry("notes", { slotDefinitions: [client("notes.widgets")] }),
        ],
        clientSlots: [
          clientEntry("m", {
            clientSlots: [contribution("notes.widgets", "m.widget", 5)],
          }),
        ],
      },
      {},
    );
    expect(result.map((item) => [item.module, item.id, item.kind])).toEqual([
      ["m", "m.widget", "client"],
    ]);
  });

  it("server and client contributions are sorted together", () => {
    const result = slotRegistry(
      {
        slots: [
          slotsEntry("notes", {
            slotDefinitions: [client("notes.widgets")],
            slots: [contribution("dashboard.sections", "notes.card", 30)],
          }),
          dashboardHost,
        ],
        clientSlots: [
          clientEntry("m", {
            clientSlots: [contribution("notes.widgets", "m.widget", 5)],
          }),
        ],
      },
      {},
    );
    expect(result.map((item) => item.id)).toEqual(["m.widget", "notes.card"]);
  });

  it("an entry without slotDefinitions and slots is accepted", () => {
    expect(
      slotRegistry(
        {
          slots: [slotsEntry("empty", {})],
          clientSlots: [clientEntry("empty", {})],
        },
        {},
      ),
    ).toEqual([]);
  });
});

describe("slotRegistry: disabled modules and the config", () => {
  const input = {
    slots: [
      dashboardHost,
      slotsEntry("invoices", {
        slots: [
          contribution("dashboard.sections", "invoices.unpaid-card", 10),
          contribution("dashboard.sections", "invoices.total", 20),
        ],
      }),
      slotsEntry("reports", {
        slots: [contribution("dashboard.sections", "reports.chart", 15)],
      }),
    ],
    clientSlots: [],
  };

  it("a module with enabled false loses its contributions", () => {
    const result = slotRegistry(input, {
      modules: { invoices: { enabled: false } },
    });
    expect(result.map((item) => item.id)).toEqual(["reports.chart"]);
  });

  it("a contribution to the slot of a disabled host module still loads", () => {
    const result = slotRegistry(
      {
        slots: [
          slotsEntry("notes", { slotDefinitions: [server("notes.panel")] }),
          slotsEntry("m", {
            slots: [contribution("notes.panel", "m.card", 1)],
          }),
        ],
        clientSlots: [],
      },
      { modules: { notes: { enabled: false } } },
    );
    expect(result.map((item) => [item.module, item.id])).toEqual([
      ["m", "m.card"],
    ]);
  });

  it("a disabled module's client-slots.ts contributions are dropped too", () => {
    const result = slotRegistry(
      {
        slots: [
          slotsEntry("notes", { slotDefinitions: [client("notes.widgets")] }),
        ],
        clientSlots: [
          clientEntry("m", {
            clientSlots: [contribution("notes.widgets", "m.widget", 5)],
          }),
          clientEntry("k", {
            clientSlots: [contribution("notes.widgets", "k.widget", 6)],
          }),
        ],
      },
      { modules: { m: { enabled: false } } },
    );
    expect(result.map((item) => item.id)).toEqual(["k.widget"]);
  });

  it("the config null on invoices.unpaid-card leaves it out", () => {
    const config: GatoConfig = {
      modules: {
        dashboard: {
          slots: { "dashboard.sections": { "invoices.unpaid-card": null } },
        },
      },
    };
    expect(slotRegistry(input, config).map((item) => item.id)).toEqual([
      "reports.chart",
      "invoices.total",
    ]);
  });

  it("the config priority 5 on a moves it first and replaces its priority", () => {
    const result = slotRegistry(
      {
        slots: [
          dashboardHost,
          slotsEntry("m", {
            slots: [
              contribution("dashboard.sections", "m.a", 20),
              contribution("dashboard.sections", "m.b", 10),
              contribution("dashboard.sections", "m.c", 10),
            ],
          }),
        ],
        clientSlots: [],
      },
      {
        modules: {
          dashboard: {
            slots: { "dashboard.sections": { "m.a": { priority: 5 } } },
          },
        },
      },
    );
    expect(result.map((item) => [item.id, item.priority])).toEqual([
      ["m.a", 5],
      ["m.b", 10],
      ["m.c", 10],
    ]);
  });

  it("a config priority equal to another one falls back to the id order", () => {
    const result = slotRegistry(input, {
      modules: {
        dashboard: {
          slots: {
            "dashboard.sections": { "invoices.total": { priority: 15 } },
          },
        },
      },
    });
    expect(result.map((item) => item.id)).toEqual([
      "invoices.unpaid-card",
      "invoices.total",
      "reports.chart",
    ]);
  });

  it("the config under modules.app applies to a core slot contribution", () => {
    const result = slotRegistry(
      {
        slots: [
          slotsEntry("m", {
            slots: [
              contribution("app.header.actions", "m.first", 1),
              contribution("app.header.actions", "m.second", 2),
            ],
          }),
        ],
        clientSlots: [],
      },
      {
        modules: {
          app: { slots: { "app.header.actions": { "m.first": null } } },
        },
      },
    );
    expect(result.map((item) => item.id)).toEqual(["m.second"]);
  });

  it("an unknown contribution id in the config throws GatoConfigError naming it", () => {
    const config: GatoConfig = {
      modules: {
        dashboard: {
          slots: { "dashboard.sections": { "invoices.nope": null } },
        },
      },
    };
    const error = thrownBy(() => slotRegistry(input, config));
    expect(error).toBeInstanceOf(GatoConfigError);
    expect((error as GatoConfigError).problems).toEqual([
      "modules.dashboard.slots.dashboard.sections.invoices.nope: unknown contribution: invoices.nope",
    ]);
  });

  it("a config naming an undeclared slot throws GatoConfigError", () => {
    const error = thrownBy(() =>
      slotRegistry(input, {
        modules: {
          dashboard: { slots: { "dashboard.nope": { "m.x": null } } },
        },
      }),
    );
    expect(error).toBeInstanceOf(GatoConfigError);
    expect((error as GatoConfigError).problems).toEqual([
      "modules.dashboard.slots.dashboard.nope: unknown slot: dashboard.nope",
    ]);
  });

  it("a structural problem wins over a config problem: SlotError, not GatoConfigError", () => {
    const error = thrownBy(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("m", {
              slots: [contribution("dashboard.nope", "m.lost", 1)],
            }),
          ],
          clientSlots: [],
        },
        {
          modules: {
            dashboard: { slots: { "dashboard.sections": { "m.none": null } } },
          },
        },
      ),
    );
    expect(error).toBeInstanceOf(SlotError);
    expect((error as Error).name).toBe("SlotError");
  });
});

describe("slotRegistry: SlotError", () => {
  it("a slot id of notes without the notes. prefix is reported", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [slotsEntry("notes", { slotDefinitions: [server("panel")] })],
          clientSlots: [],
        },
        {},
      ),
    );
    expect(message).toContain('slot ids must start with "notes.": panel');
  });

  it("a slot id that starts with the module name but not with its dot is reported", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            slotsEntry("notes", { slotDefinitions: [server("notesx.panel")] }),
          ],
          clientSlots: [],
        },
        {},
      ),
    );
    expect(message).toContain(
      'slot ids must start with "notes.": notesx.panel',
    );
  });

  it("a slot declared by dashboard and again by notes is a duplicate naming both owners in order", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("notes", {
              slotDefinitions: [server("dashboard.sections")],
            }),
          ],
          clientSlots: [],
        },
        {},
      ),
    );
    expect(message).toContain(
      "duplicate slot: dashboard.sections (declared by dashboard and notes)",
    );
    expect(message).toContain(
      'slot ids must start with "notes.": dashboard.sections',
    );
  });

  it("a module named app declaring app.header.actions duplicates the core slot owned by app", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            slotsEntry("app", {
              slotDefinitions: [server("app.header.actions")],
            }),
          ],
          clientSlots: [],
        },
        {},
      ),
    );
    expect(message).toContain(
      "duplicate slot: app.header.actions (declared by app and app)",
    );
  });

  it("a contribution id of m without the m. prefix is reported", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("m", {
              slots: [contribution("dashboard.sections", "card", 1)],
            }),
          ],
          clientSlots: [],
        },
        {},
      ),
    );
    expect(message).toContain('contribution ids must start with "m.": card');
  });

  it("a client-slots.ts contribution id without the module prefix is reported", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            slotsEntry("notes", { slotDefinitions: [client("notes.widgets")] }),
          ],
          clientSlots: [
            clientEntry("m", {
              clientSlots: [contribution("notes.widgets", "mx.widget", 1)],
            }),
          ],
        },
        {},
      ),
    );
    expect(message).toContain(
      'contribution ids must start with "m.": mx.widget',
    );
  });

  it("two modules contributing x.card throw naming both modules", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("x", {
              slots: [contribution("dashboard.sections", "x.card", 1)],
            }),
            slotsEntry("y", {
              slots: [contribution("dashboard.sections", "x.card", 2)],
            }),
          ],
          clientSlots: [],
        },
        {},
      ),
    );
    expect(message).toContain(
      "duplicate contribution: x.card (contributed by x and y)",
    );
  });

  it("one id in slots.ts and in client-slots.ts of the same module is a duplicate", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("notes", {
              slotDefinitions: [client("notes.widgets")],
              slots: [contribution("dashboard.sections", "notes.card", 1)],
            }),
          ],
          clientSlots: [
            clientEntry("notes", {
              clientSlots: [contribution("notes.widgets", "notes.card", 1)],
            }),
          ],
        },
        {},
      ),
    );
    expect(message).toContain(
      "duplicate contribution: notes.card (contributed by notes and notes)",
    );
  });

  it("a contribution to dashboard.nope throws unknown slot naming the contributing module", () => {
    expect(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("invoices", {
              slots: [contribution("dashboard.nope", "invoices.lost", 1)],
            }),
          ],
          clientSlots: [],
        },
        {},
      ),
    ).toThrow("unknown slot: dashboard.nope (contributed by invoices)");
  });

  it("a contribution of a disabled module to an unknown slot still throws", () => {
    expect(() =>
      slotRegistry(
        {
          slots: [
            slotsEntry("invoices", {
              slots: [contribution("dashboard.nope", "invoices.lost", 1)],
            }),
          ],
          clientSlots: [],
        },
        { modules: { invoices: { enabled: false } } },
      ),
    ).toThrow("unknown slot: dashboard.nope (contributed by invoices)");
  });

  it("a slots.ts contribution to a client slot is told to move to client-slots.ts", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            slotsEntry("notes", { slotDefinitions: [client("notes.widgets")] }),
            slotsEntry("m", {
              slots: [contribution("notes.widgets", "m.widget", 1)],
            }),
          ],
          clientSlots: [],
        },
        {},
      ),
    );
    expect(message).toContain(
      "m.widget is in slots.ts but notes.widgets is a client slot; move it to client-slots.ts",
    );
  });

  it("a client-slots.ts contribution to a server slot is told to move to slots.ts", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [dashboardHost],
          clientSlots: [
            clientEntry("m", {
              clientSlots: [contribution("dashboard.sections", "m.action", 1)],
            }),
          ],
        },
        {},
      ),
    );
    expect(message).toContain(
      "m.action is in client-slots.ts but dashboard.sections is a server slot; move it to slots.ts",
    );
  });

  it("a client-slots.ts contribution to the core server slot is told to move to slots.ts", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [],
          clientSlots: [
            clientEntry("m", {
              clientSlots: [contribution("app.header.actions", "m.action", 1)],
            }),
          ],
        },
        {},
      ),
    );
    expect(message).toContain(
      "m.action is in client-slots.ts but app.header.actions is a server slot; move it to slots.ts",
    );
  });

  it("lists every problem, each on its own line, in the order of the checks", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("m", {
              slots: [
                contribution("dashboard.nope", "m.lost", 1),
                contribution("dashboard.sections", "other.card", 2),
              ],
            }),
            slotsEntry("notes", { slotDefinitions: [server("wrong.panel")] }),
          ],
          clientSlots: [
            clientEntry("m", {
              clientSlots: [contribution("dashboard.sections", "m.action", 3)],
            }),
          ],
        },
        {},
      ),
    );
    const expected = [
      'slot ids must start with "notes.": wrong.panel',
      'contribution ids must start with "m.": other.card',
      "unknown slot: dashboard.nope (contributed by m)",
      "m.action is in client-slots.ts but dashboard.sections is a server slot; move it to slots.ts",
    ];
    const lines = message.split("\n");
    const positions = expected.map((problem) =>
      lines.findIndex((line) => line.includes(problem)),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(new Set(positions).size).toBe(4);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("a duplicate slot is listed after the prefix problem and before contribution problems", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            slotsEntry("m", {
              slots: [contribution("dashboard.sections", "bad.card", 1)],
            }),
            dashboardHost,
            slotsEntry("notes", {
              slotDefinitions: [server("dashboard.sections")],
            }),
          ],
          clientSlots: [],
        },
        {},
      ),
    );
    const prefix = message.indexOf(
      'slot ids must start with "notes.": dashboard.sections',
    );
    const duplicate = message.indexOf(
      "duplicate slot: dashboard.sections (declared by dashboard and notes)",
    );
    const contributionPrefix = message.indexOf(
      'contribution ids must start with "m.": bad.card',
    );
    expect(prefix).toBeGreaterThanOrEqual(0);
    expect(duplicate).toBeGreaterThan(prefix);
    expect(contributionPrefix).toBeGreaterThan(duplicate);
  });

  it("a duplicate contribution is listed before an unknown slot", () => {
    const message = slotErrorMessage(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("m", {
              slots: [
                contribution("dashboard.nope", "m.lost", 1),
                contribution("dashboard.sections", "m.card", 1),
                contribution("dashboard.sections", "m.card", 2),
              ],
            }),
          ],
          clientSlots: [],
        },
        {},
      ),
    );
    const duplicate = message.indexOf(
      "duplicate contribution: m.card (contributed by m and m)",
    );
    const unknown = message.indexOf(
      "unknown slot: dashboard.nope (contributed by m)",
    );
    expect(duplicate).toBeGreaterThanOrEqual(0);
    expect(unknown).toBeGreaterThan(duplicate);
  });

  it("valid declarations and contributions do not throw", () => {
    expect(() =>
      slotRegistry(
        {
          slots: [
            dashboardHost,
            slotsEntry("notes", {
              slotDefinitions: [client("notes.widgets")],
              slots: [contribution("dashboard.sections", "notes.card", 1)],
            }),
          ],
          clientSlots: [
            clientEntry("notes", {
              clientSlots: [contribution("notes.widgets", "notes.widget", 1)],
            }),
          ],
        },
        {},
      ),
    ).not.toThrow();
  });
});

describe("slotConfigProblems", () => {
  const input = {
    slots: [
      dashboardHost,
      slotsEntry("account", { slotDefinitions: [server("account.sections")] }),
      slotsEntry("m", {
        slots: [
          contribution("dashboard.sections", "m.card", 1),
          contribution("app.header.actions", "m.action", 1),
        ],
      }),
    ],
    clientSlots: [],
  };

  it("returns an empty list for an empty config", () => {
    expect(slotConfigProblems(input, {})).toEqual([]);
  });

  it("returns an empty list for a null and a priority on existing contributions", () => {
    expect(
      slotConfigProblems(input, {
        modules: {
          dashboard: { slots: { "dashboard.sections": { "m.card": null } } },
          app: {
            slots: { "app.header.actions": { "m.action": { priority: 3 } } },
          },
        },
      }),
    ).toEqual([]);
  });

  it("an undeclared slot under dashboard is an unknown slot", () => {
    expect(
      slotConfigProblems(input, {
        modules: {
          dashboard: { slots: { "dashboard.nope": { "m.card": null } } },
        },
      }),
    ).toEqual([
      "modules.dashboard.slots.dashboard.nope: unknown slot: dashboard.nope",
    ]);
  });

  it("a slot named under a module that does not own it is an unknown slot", () => {
    expect(
      slotConfigProblems(input, {
        modules: {
          account: { slots: { "dashboard.sections": { "m.card": null } } },
        },
      }),
    ).toEqual([
      "modules.account.slots.dashboard.sections: unknown slot: dashboard.sections",
    ]);
  });

  it("a core slot named under a feature module is an unknown slot", () => {
    expect(
      slotConfigProblems(input, {
        modules: {
          dashboard: { slots: { "app.header.actions": { "m.action": null } } },
        },
      }),
    ).toEqual([
      "modules.dashboard.slots.app.header.actions: unknown slot: app.header.actions",
    ]);
  });

  it("a feature slot named under modules.app is an unknown slot", () => {
    expect(
      slotConfigProblems(input, {
        modules: {
          app: { slots: { "dashboard.sections": { "m.card": null } } },
        },
      }),
    ).toEqual([
      "modules.app.slots.dashboard.sections: unknown slot: dashboard.sections",
    ]);
  });

  it("modules.app with a contribution that does not exist is an unknown contribution", () => {
    expect(
      slotConfigProblems(input, {
        modules: { app: { slots: { "app.header.actions": { "x.y": null } } } },
      }),
    ).toEqual([
      "modules.app.slots.app.header.actions.x.y: unknown contribution: x.y",
    ]);
  });

  it("a contribution to another slot is unknown for this slot", () => {
    expect(
      slotConfigProblems(input, {
        modules: {
          dashboard: { slots: { "dashboard.sections": { "m.action": null } } },
        },
      }),
    ).toEqual([
      "modules.dashboard.slots.dashboard.sections.m.action: unknown contribution: m.action",
    ]);
  });

  it("a contribution of a disabled module is still known", () => {
    expect(
      slotConfigProblems(input, {
        modules: {
          m: { enabled: false },
          dashboard: { slots: { "dashboard.sections": { "m.card": null } } },
        },
      }),
    ).toEqual([]);
  });

  it("a slot declared by a disabled module is still known under its owner", () => {
    expect(
      slotConfigProblems(
        {
          slots: [
            slotsEntry("notes", { slotDefinitions: [server("notes.panel")] }),
            slotsEntry("m", {
              slots: [contribution("notes.panel", "m.card", 1)],
            }),
          ],
          clientSlots: [],
        },
        {
          modules: {
            notes: {
              enabled: false,
              slots: { "notes.panel": { "m.card": { priority: 2 } } },
            },
          },
        },
      ),
    ).toEqual([]);
  });

  it("a client-slots.ts contribution is known to the config", () => {
    expect(
      slotConfigProblems(
        {
          slots: [
            slotsEntry("notes", { slotDefinitions: [client("notes.widgets")] }),
          ],
          clientSlots: [
            clientEntry("m", {
              clientSlots: [contribution("notes.widgets", "m.widget", 1)],
            }),
          ],
        },
        {
          modules: {
            notes: { slots: { "notes.widgets": { "m.widget": null } } },
          },
        },
      ),
    ).toEqual([]);
  });

  it("reports problems in config key order", () => {
    expect(
      slotConfigProblems(input, {
        modules: {
          dashboard: { slots: { "dashboard.sections": { "m.zzz": null } } },
          account: { slots: { "account.nope": { "m.card": null } } },
          app: { slots: { "app.header.actions": { "m.aaa": null } } },
        },
      }),
    ).toEqual([
      "modules.dashboard.slots.dashboard.sections.m.zzz: unknown contribution: m.zzz",
      "modules.account.slots.account.nope: unknown slot: account.nope",
      "modules.app.slots.app.header.actions.m.aaa: unknown contribution: m.aaa",
    ]);
  });

  it("does not throw", () => {
    expect(() =>
      slotConfigProblems(input, {
        modules: {
          dashboard: { slots: { "dashboard.nope": { "x.y": null } } },
        },
      }),
    ).not.toThrow();
  });
});

describe("clientSlotRegistry", () => {
  const entries = [
    clientEntry("m", {
      clientSlots: [
        contribution("notes.widgets", "m.a", 20),
        contribution("notes.widgets", "m.b", 10),
        contribution("notes.widgets", "m.c", 10),
      ],
    }),
  ];

  it("contributions a (20), b (10), c (10) come out as b, c, a with kind client", () => {
    const result = clientSlotRegistry(entries, {});
    expect(result.map((item) => [item.id, item.module, item.kind])).toEqual([
      ["m.b", "m", "client"],
      ["m.c", "m", "client"],
      ["m.a", "m", "client"],
    ]);
  });

  it("equal priorities from the registry order m.z, m.y come out as m.y, m.z", () => {
    const result = clientSlotRegistry(
      [
        clientEntry("m", {
          clientSlots: [
            contribution("notes.widgets", "m.z", 1),
            contribution("notes.widgets", "m.y", 1),
          ],
        }),
      ],
      {},
    );
    expect(result.map((item) => item.id)).toEqual(["m.y", "m.z"]);
  });

  it("keeps the slot, priority, roles and loader of each contribution", () => {
    const result = clientSlotRegistry(
      [
        clientEntry("m", {
          clientSlots: [contribution("notes.widgets", "m.a", 7, ["admin"])],
        }),
      ],
      {},
    );
    expect(result).toEqual([
      {
        slot: "notes.widgets",
        id: "m.a",
        priority: 7,
        roles: ["admin"],
        component: loader,
        module: "m",
        kind: "client",
      },
    ]);
  });

  it("drops the contributions of a disabled module", () => {
    const result = clientSlotRegistry(
      [
        ...entries,
        clientEntry("k", {
          clientSlots: [contribution("notes.widgets", "k.widget", 1)],
        }),
      ],
      { modules: { m: { enabled: false } } },
    );
    expect(result.map((item) => item.id)).toEqual(["k.widget"]);
  });

  it("drops a contribution the config sets to null under the slot owner", () => {
    const result = clientSlotRegistry(entries, {
      modules: { notes: { slots: { "notes.widgets": { "m.b": null } } } },
    });
    expect(result.map((item) => item.id)).toEqual(["m.c", "m.a"]);
  });

  it("drops a contribution the config sets to null under any module key", () => {
    const result = clientSlotRegistry(entries, {
      modules: { other: { slots: { "notes.widgets": { "m.c": null } } } },
    });
    expect(result.map((item) => item.id)).toEqual(["m.b", "m.a"]);
  });

  it("applies a configured priority and sorts by it", () => {
    const result = clientSlotRegistry(entries, {
      modules: {
        notes: { slots: { "notes.widgets": { "m.a": { priority: 5 } } } },
      },
    });
    expect(result.map((item) => [item.id, item.priority])).toEqual([
      ["m.a", 5],
      ["m.b", 10],
      ["m.c", 10],
    ]);
  });

  it("a null for the same id under another slot does not drop it", () => {
    const result = clientSlotRegistry(entries, {
      modules: { notes: { slots: { "notes.other": { "m.b": null } } } },
    });
    expect(result.map((item) => item.id)).toEqual(["m.b", "m.c", "m.a"]);
  });

  it("does not validate: an unknown slot and an unprefixed id pass through", () => {
    const result = clientSlotRegistry(
      [
        clientEntry("m", {
          clientSlots: [contribution("nowhere.slot", "card", 1)],
        }),
      ],
      { modules: { ghost: { slots: { "ghost.slot": { "ghost.x": null } } } } },
    );
    expect(result.map((item) => [item.slot, item.id])).toEqual([
      ["nowhere.slot", "card"],
    ]);
  });

  it("an entry without clientSlots gives no contribution", () => {
    expect(clientSlotRegistry([clientEntry("m", {})], {})).toEqual([]);
  });
});
