// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import {
  TenantScopeError,
  findTenantScopedModels,
  isTenantScopeSatisfied,
  isTenantScoped,
} from "../tenant-scope";

const WHERE_OPERATIONS = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
] as const;

const CREATE_MANY_OPERATIONS = ["createMany", "createManyAndReturn"] as const;

describe("isTenantScopeSatisfied: wartość organizationId w where", () => {
  it("napis przypina organizację", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: "org_a" },
      }),
    ).toBe(true);
  });

  it("{ equals: napis } przypina organizację", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { equals: "org_a" } },
      }),
    ).toBe(true);
  });

  it("{ in: [napis] } przypina organizację", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { in: ["org_a"] } },
      }),
    ).toBe(true);
  });

  it("{ in: [dwa napisy] } przypina organizacje", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { in: ["org_a", "org_b"] } },
      }),
    ).toBe(true);
  });

  it("{ in: [] } nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { in: [] } },
      }),
    ).toBe(false);
  });

  it("{ in } z pustym napisem obok poprawnego nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { in: ["org_a", ""] } },
      }),
    ).toBe(false);
  });

  it("{ in } z wartością nienapisową nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { in: ["org_a", null] } },
      }),
    ).toBe(false);
  });

  it("{ in } z napisem zamiast tablicy nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { in: "org_a" } },
      }),
    ).toBe(false);
  });

  it("{ not: napis } nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { not: "org_a" } },
      }),
    ).toBe(false);
  });

  it("{ notIn: [napis] } nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { notIn: ["org_a"] } },
      }),
    ).toBe(false);
  });

  it("{ equals: undefined } nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { equals: undefined } },
      }),
    ).toBe(false);
  });

  it("{ equals: pusty napis } nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { equals: "" } },
      }),
    ).toBe(false);
  });

  it("{ equals: null } nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { equals: null } },
      }),
    ).toBe(false);
  });

  it("pusty obiekt nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", { where: { organizationId: {} } }),
    ).toBe(false);
  });

  it("undefined nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: undefined },
      }),
    ).toBe(false);
  });

  it("pusty napis nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", { where: { organizationId: "" } }),
    ).toBe(false);
  });

  it("null nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", { where: { organizationId: null } }),
    ).toBe(false);
  });

  it("liczba nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", { where: { organizationId: 1 } }),
    ).toBe(false);
  });

  it("{ contains: napis } nie przypina organizacji", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: { contains: "org_a" } },
      }),
    ).toBe(false);
  });
});

describe("isTenantScopeSatisfied: kształt where", () => {
  it("where po samym id nie ma filtra organizacji", () => {
    expect(isTenantScopeSatisfied("findMany", { where: { id: "x" } })).toBe(
      false,
    );
  });

  it("brak where to brak filtra", () => {
    expect(isTenantScopeSatisfied("findMany", {})).toBe(false);
  });

  it("pusty where to brak filtra", () => {
    expect(isTenantScopeSatisfied("findMany", { where: {} })).toBe(false);
  });

  it("where null to brak filtra", () => {
    expect(isTenantScopeSatisfied("findMany", { where: null })).toBe(false);
  });

  it("organizationId obok innych pól wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { id: "x", organizationId: "org_a", name: { contains: "a" } },
      }),
    ).toBe(true);
  });

  it("filtr relacji organization nie liczy się jako filtr", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organization: { id: "org_a" } },
      }),
    ).toBe(false);
  });

  it("filtr relacji z organizationId w środku nie liczy się jako filtr", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { member: { organizationId: "org_a" } },
      }),
    ).toBe(false);
  });

  it("organizationId zagnieżdżone w polu innego modelu nie liczy się jako filtr", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: {
          createdBy: { members: { some: { organizationId: "org_a" } } },
        },
      }),
    ).toBe(false);
  });

  it("NOT z organizacją jako obiektem nie liczy się jako filtr", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { NOT: { organizationId: "org_a" } },
      }),
    ).toBe(false);
  });

  it("NOT z organizacją w tablicy nie liczy się jako filtr", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { NOT: [{ organizationId: "org_a" }] },
      }),
    ).toBe(false);
  });

  it("args null nie spełnia filtra", () => {
    expect(isTenantScopeSatisfied("findMany", null)).toBe(false);
  });

  it("args undefined nie spełnia filtra", () => {
    expect(isTenantScopeSatisfied("findMany", undefined)).toBe(false);
  });

  it("args jako napis nie spełnia filtra", () => {
    expect(isTenantScopeSatisfied("findMany", "org_a")).toBe(false);
  });

  it("args jako tablica nie spełnia filtra", () => {
    expect(
      isTenantScopeSatisfied("findMany", [
        { where: { organizationId: "org_a" } },
      ]),
    ).toBe(false);
  });
});

describe("isTenantScopeSatisfied: AND", () => {
  it("jeden element tablicy AND z organizacją wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { AND: [{ id: "x" }, { organizationId: "org_a" }] },
      }),
    ).toBe(true);
  });

  it("organizacja w pierwszym elemencie AND też wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { AND: [{ organizationId: "org_a" }, { id: "x" }] },
      }),
    ).toBe(true);
  });

  it("AND jako obiekt z organizacją wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { AND: { organizationId: "org_a" } },
      }),
    ).toBe(true);
  });

  it("AND bez organizacji w żadnym elemencie nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { AND: [{ id: "x" }, { name: "y" }] },
      }),
    ).toBe(false);
  });

  it("AND jako obiekt bez organizacji nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", { where: { AND: { id: "x" } } }),
    ).toBe(false);
  });

  it("pusta tablica AND nie wystarcza", () => {
    expect(isTenantScopeSatisfied("findMany", { where: { AND: [] } })).toBe(
      false,
    );
  });

  it("AND z elementem { not } nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { AND: [{ organizationId: { not: "org_a" } }] },
      }),
    ).toBe(false);
  });

  it("zagnieżdżony AND z organizacją wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { AND: [{ id: "x" }, { AND: [{ organizationId: "org_a" }] }] },
      }),
    ).toBe(true);
  });

  it("AND zawierający NOT z organizacją nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { AND: [{ NOT: { organizationId: "org_a" } }] },
      }),
    ).toBe(false);
  });

  it("AND z OR, w którym każda gałąź ma organizację, wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: {
          AND: [
            { id: "x" },
            {
              OR: [{ organizationId: "org_a" }, { organizationId: "org_b" }],
            },
          ],
        },
      }),
    ).toBe(true);
  });
});

describe("isTenantScopeSatisfied: OR", () => {
  it("OR z organizacją w każdej gałęzi wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: {
          OR: [{ organizationId: "org_a" }, { organizationId: "org_b" }],
        },
      }),
    ).toBe(true);
  });

  it("OR z gałęzią bez organizacji na końcu nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { OR: [{ organizationId: "org_a" }, { id: "x" }] },
      }),
    ).toBe(false);
  });

  it("OR z gałęzią bez organizacji na początku nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { OR: [{ id: "x" }, { organizationId: "org_a" }] },
      }),
    ).toBe(false);
  });

  it("pusta tablica OR nie wystarcza", () => {
    expect(isTenantScopeSatisfied("findMany", { where: { OR: [] } })).toBe(
      false,
    );
  });

  it("OR jako obiekt nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { OR: { organizationId: "org_a" } },
      }),
    ).toBe(false);
  });

  it("OR z jedną gałęzią z organizacją wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { OR: [{ organizationId: "org_a" }] },
      }),
    ).toBe(true);
  });

  it("OR z gałęziami AND, z których każda ma organizację, wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: {
          OR: [
            { AND: [{ id: "x" }, { organizationId: "org_a" }] },
            { organizationId: { in: ["org_b"] } },
          ],
        },
      }),
    ).toBe(true);
  });

  it("OR z gałęzią NOT nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: {
          OR: [
            { organizationId: "org_a" },
            { NOT: { organizationId: "org_b" } },
          ],
        },
      }),
    ).toBe(false);
  });

  it("OR bez organizacji obok organizationId na najwyższym poziomie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findMany", {
        where: { organizationId: "org_a", OR: [{ id: "x" }, { id: "y" }] },
      }),
    ).toBe(true);
  });
});

describe("isTenantScopeSatisfied: selektor złożony", () => {
  it("organizationId_userId z organizacją wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findUnique", {
        where: {
          organizationId_userId: { organizationId: "org_a", userId: "u" },
        },
      }),
    ).toBe(true);
  });

  it("userId_organizationId z organizacją wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findUnique", {
        where: {
          userId_organizationId: { userId: "u", organizationId: "org_a" },
        },
      }),
    ).toBe(true);
  });

  it("selektor złożony z pustym organizationId nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findUnique", {
        where: { organizationId_userId: { organizationId: "", userId: "u" } },
      }),
    ).toBe(false);
  });

  it("selektor złożony bez organizationId w wartości nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findUnique", {
        where: { organizationId_userId: { userId: "u" } },
      }),
    ).toBe(false);
  });

  it("selektor złożony z napisem zamiast obiektu nie wystarcza", () => {
    expect(
      isTenantScopeSatisfied("findUnique", {
        where: { organizationId_userId: "org_a" },
      }),
    ).toBe(false);
  });

  it("klucz tylko zawierający napis organizationId nie jest selektorem złożonym", () => {
    expect(
      isTenantScopeSatisfied("findUnique", {
        where: { legacyorganizationId_userId: { organizationId: "org_a" } },
      }),
    ).toBe(false);
  });

  it("klucz bez organizationId wśród członów nie jest selektorem złożonym", () => {
    expect(
      isTenantScopeSatisfied("findUnique", {
        where: { userId_name: { organizationId: "org_a", userId: "u" } },
      }),
    ).toBe(false);
  });
});

describe("isTenantScopeSatisfied: operacje z where", () => {
  it.each(WHERE_OPERATIONS)(
    "%s z organizationId w where jest dozwolone",
    (operation) => {
      expect(
        isTenantScopeSatisfied(operation, {
          where: { organizationId: "org_a" },
        }),
      ).toBe(true);
    },
  );

  it.each(WHERE_OPERATIONS)("%s bez where jest odrzucone", (operation) => {
    expect(isTenantScopeSatisfied(operation, {})).toBe(false);
  });

  it.each(WHERE_OPERATIONS)("%s z where po id jest odrzucone", (operation) => {
    expect(isTenantScopeSatisfied(operation, { where: { id: "x" } })).toBe(
      false,
    );
  });

  it("count bez args jest odrzucone", () => {
    expect(isTenantScopeSatisfied("count", {})).toBe(false);
  });

  it("deleteMany z organizationId jest dozwolone", () => {
    expect(
      isTenantScopeSatisfied("deleteMany", {
        where: { organizationId: "org_a" },
      }),
    ).toBe(true);
  });

  it("update z organizacją tylko w data jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("update", {
        where: { id: "x" },
        data: { organizationId: "org_a" },
      }),
    ).toBe(false);
  });

  it("nieznana operacja findRaw jest odrzucona mimo organizationId w where", () => {
    expect(
      isTenantScopeSatisfied("findRaw", { where: { organizationId: "org_a" } }),
    ).toBe(false);
  });

  it("nieznana operacja aggregateRaw jest odrzucona", () => {
    expect(
      isTenantScopeSatisfied("aggregateRaw", {
        where: { organizationId: "org_a" },
      }),
    ).toBe(false);
  });

  it("pusta nazwa operacji jest odrzucona", () => {
    expect(
      isTenantScopeSatisfied("", { where: { organizationId: "org_a" } }),
    ).toBe(false);
  });
});

describe("isTenantScopeSatisfied: create", () => {
  it("create z data.organizationId jest dozwolone", () => {
    expect(
      isTenantScopeSatisfied("create", { data: { organizationId: "org_a" } }),
    ).toBe(true);
  });

  it("create przez organization.connect jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("create", {
        data: { organization: { connect: { id: "org_a" } } },
      }),
    ).toBe(false);
  });

  it("create z pustym data.organizationId jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("create", { data: { organizationId: "" } }),
    ).toBe(false);
  });

  it("create z data.organizationId null jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("create", { data: { organizationId: null } }),
    ).toBe(false);
  });

  it("create bez data jest odrzucone", () => {
    expect(isTenantScopeSatisfied("create", {})).toBe(false);
  });

  it("create z organizacją tylko w where jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("create", {
        where: { organizationId: "org_a" },
        data: { name: "x" },
      }),
    ).toBe(false);
  });
});

describe("isTenantScopeSatisfied: createMany i createManyAndReturn", () => {
  it.each(CREATE_MANY_OPERATIONS)(
    "%s z organizationId tylko w pierwszym wierszu jest odrzucone",
    (operation) => {
      expect(
        isTenantScopeSatisfied(operation, {
          data: [{ organizationId: "org_a" }, { name: "x" }],
        }),
      ).toBe(false);
    },
  );

  it.each(CREATE_MANY_OPERATIONS)(
    "%s z organizationId tylko w ostatnim wierszu jest odrzucone",
    (operation) => {
      expect(
        isTenantScopeSatisfied(operation, {
          data: [{ name: "x" }, { organizationId: "org_a" }],
        }),
      ).toBe(false);
    },
  );

  it.each(CREATE_MANY_OPERATIONS)(
    "%s z organizationId w każdym wierszu jest dozwolone",
    (operation) => {
      expect(
        isTenantScopeSatisfied(operation, {
          data: [{ organizationId: "org_a" }, { organizationId: "org_b" }],
        }),
      ).toBe(true);
    },
  );

  it.each(CREATE_MANY_OPERATIONS)(
    "%s z pustym organizationId w drugim wierszu jest odrzucone",
    (operation) => {
      expect(
        isTenantScopeSatisfied(operation, {
          data: [{ organizationId: "org_a" }, { organizationId: "" }],
        }),
      ).toBe(false);
    },
  );

  it.each(CREATE_MANY_OPERATIONS)(
    "%s z pojedynczym obiektem z organizationId jest dozwolone",
    (operation) => {
      expect(
        isTenantScopeSatisfied(operation, {
          data: { organizationId: "org_a" },
        }),
      ).toBe(true);
    },
  );

  it.each(CREATE_MANY_OPERATIONS)(
    "%s z pojedynczym obiektem bez organizationId jest odrzucone",
    (operation) => {
      expect(isTenantScopeSatisfied(operation, { data: { name: "x" } })).toBe(
        false,
      );
    },
  );

  it.each(CREATE_MANY_OPERATIONS)(
    "%s z pustą tablicą nic nie zapisuje i jest dozwolone",
    (operation) => {
      expect(isTenantScopeSatisfied(operation, { data: [] })).toBe(true);
    },
  );

  it.each(CREATE_MANY_OPERATIONS)("%s bez data jest odrzucone", (operation) => {
    expect(isTenantScopeSatisfied(operation, {})).toBe(false);
  });

  it.each(CREATE_MANY_OPERATIONS)(
    "%s z wierszem null jest odrzucone",
    (operation) => {
      expect(
        isTenantScopeSatisfied(operation, {
          data: [{ organizationId: "org_a" }, null],
        }),
      ).toBe(false);
    },
  );
});

describe("isTenantScopeSatisfied: upsert", () => {
  it("upsert z filtrem w where i create.organizationId jest dozwolone", () => {
    expect(
      isTenantScopeSatisfied("upsert", {
        where: { organizationId: "org_a" },
        create: { organizationId: "org_a" },
        update: {},
      }),
    ).toBe(true);
  });

  it("upsert bez create.organizationId jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("upsert", {
        where: { organizationId: "org_a" },
        create: { name: "x" },
        update: {},
      }),
    ).toBe(false);
  });

  it("upsert bez create jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("upsert", {
        where: { organizationId: "org_a" },
        update: {},
      }),
    ).toBe(false);
  });

  it("upsert z pustym create.organizationId jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("upsert", {
        where: { organizationId: "org_a" },
        create: { organizationId: "" },
        update: {},
      }),
    ).toBe(false);
  });

  it("upsert z create.organizationId, ale where po id jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("upsert", {
        where: { id: "x" },
        create: { organizationId: "org_a" },
        update: {},
      }),
    ).toBe(false);
  });

  it("upsert z selektorem złożonym i create.organizationId jest dozwolone", () => {
    expect(
      isTenantScopeSatisfied("upsert", {
        where: {
          organizationId_userId: { organizationId: "org_a", userId: "u" },
        },
        create: { organizationId: "org_a", userId: "u" },
        update: { name: "x" },
      }),
    ).toBe(true);
  });

  it("upsert z create przez organization.connect jest odrzucone", () => {
    expect(
      isTenantScopeSatisfied("upsert", {
        where: { organizationId: "org_a" },
        create: { organization: { connect: { id: "org_a" } } },
        update: {},
      }),
    ).toBe(false);
  });
});

const fieldName = fc
  .stringMatching(/^[a-z][a-zA-Z]{0,11}$/)
  .filter((key) => key !== "organizationId");
const looseWhere = fc.dictionary(fieldName, fc.jsonValue(), { maxKeys: 4 });
const orgId = fc.string({ minLength: 1, maxLength: 20 });
const whereOperation = fc.constantFrom(...WHERE_OPERATIONS);

describe("isTenantScopeSatisfied: niezmienniki", () => {
  test.prop([whereOperation, fc.jsonValue()])(
    "where złożone wyłącznie z NOT nigdy nie spełnia filtra",
    (operation, negated) => {
      expect(
        isTenantScopeSatisfied(operation, { where: { NOT: negated } }),
      ).toBe(false);
    },
  );

  test.prop([whereOperation, orgId])(
    "NOT z przypiętą organizacją nie spełnia filtra dla dowolnej organizacji",
    (operation, organizationId) => {
      expect(
        isTenantScopeSatisfied(operation, {
          where: { NOT: { organizationId } },
        }),
      ).toBe(false);
    },
  );

  test.prop([
    whereOperation,
    fc.array(orgId, { maxLength: 4 }),
    fc.array(orgId, { maxLength: 4 }),
    fc.string({ maxLength: 10 }),
  ])(
    "OR z jedną gałęzią bez organizacji nie spełnia filtra, gdziekolwiek ta gałąź stoi",
    (operation, before, after, id) => {
      const branches = [
        ...before.map((organizationId) => ({ organizationId })),
        { id },
        ...after.map((organizationId) => ({ organizationId })),
      ];
      expect(
        isTenantScopeSatisfied(operation, { where: { OR: branches } }),
      ).toBe(false);
    },
  );

  test.prop([whereOperation, fc.array(orgId, { minLength: 1, maxLength: 5 })])(
    "OR, w którym każda gałąź przypina organizację, spełnia filtr",
    (operation, organizationIds) => {
      expect(
        isTenantScopeSatisfied(operation, {
          where: {
            OR: organizationIds.map((organizationId) => ({ organizationId })),
          },
        }),
      ).toBe(true);
    },
  );

  test.prop([whereOperation, orgId, looseWhere])(
    "dodatkowe pola obok przypiętej organizacji nie odbierają filtra",
    (operation, organizationId, extra) => {
      expect(
        isTenantScopeSatisfied(operation, {
          where: { ...extra, organizationId },
        }),
      ).toBe(true);
    },
  );

  test.prop([whereOperation, looseWhere])(
    "where bez organizationId, AND, OR i selektora złożonego nie spełnia filtra",
    (operation, where) => {
      expect(isTenantScopeSatisfied(operation, { where })).toBe(false);
    },
  );

  test.prop([whereOperation, fc.array(orgId, { minLength: 1, maxLength: 5 })])(
    "{ in } z niepustą listą niepustych napisów spełnia filtr",
    (operation, organizationIds) => {
      expect(
        isTenantScopeSatisfied(operation, {
          where: { organizationId: { in: organizationIds } },
        }),
      ).toBe(true);
    },
  );

  test.prop([whereOperation, fc.array(orgId, { maxLength: 4 }), fc.nat()])(
    "{ in } z pustym napisem w dowolnym miejscu nie spełnia filtra",
    (operation, organizationIds, position) => {
      const at = position % (organizationIds.length + 1);
      const values = [
        ...organizationIds.slice(0, at),
        "",
        ...organizationIds.slice(at),
      ];
      expect(
        isTenantScopeSatisfied(operation, {
          where: { organizationId: { in: values } },
        }),
      ).toBe(false);
    },
  );

  test.prop([
    fc.constantFrom(...CREATE_MANY_OPERATIONS),
    fc.array(orgId, { maxLength: 4 }),
    fc.array(orgId, { maxLength: 4 }),
  ])(
    "createMany z jednym wierszem bez organizationId nie spełnia filtra, gdziekolwiek ten wiersz stoi",
    (operation, before, after) => {
      const data = [
        ...before.map((organizationId) => ({ organizationId, name: "x" })),
        { name: "bez organizacji" },
        ...after.map((organizationId) => ({ organizationId, name: "x" })),
      ];
      expect(isTenantScopeSatisfied(operation, { data })).toBe(false);
    },
  );
});

describe("findTenantScopedModels", () => {
  it("zwraca modele z polem organizationId poza Member i Invitation", () => {
    expect(
      findTenantScopedModels({
        ApiKey: ["id", "organizationId"],
        Member: ["id", "organizationId", "userId"],
        Invitation: ["id", "email", "organizationId"],
        User: ["id"],
        Widget: ["organizationId"],
      }),
    ).toEqual(["ApiKey", "Widget"]);
  });

  it("zachowuje kolejność wejścia", () => {
    expect(
      findTenantScopedModels({
        Zeta: ["organizationId"],
        Alpha: ["id", "organizationId"],
        Mid: ["id"],
      }),
    ).toEqual(["Zeta", "Alpha"]);
  });

  it("nie obejmuje modeli z polami tylko podobnymi do organizationId", () => {
    expect(
      findTenantScopedModels({
        Snake: ["organization_id"],
        Prefixed: ["parentOrganizationId"],
        Suffixed: ["organizationIdLegacy"],
        Relation: ["organization"],
      }),
    ).toEqual([]);
  });

  it("pusty schemat daje pustą listę", () => {
    expect(findTenantScopedModels({})).toEqual([]);
  });

  it("Member i Invitation same są pominięte", () => {
    expect(
      findTenantScopedModels({
        Member: ["organizationId"],
        Invitation: ["organizationId"],
      }),
    ).toEqual([]);
  });

  it("model z nazwą podobną do Member jest objęty", () => {
    expect(
      findTenantScopedModels({
        TeamMember: ["organizationId"],
        MemberNote: ["organizationId"],
      }),
    ).toEqual(["TeamMember", "MemberNote"]);
  });
});

describe("isTenantScoped na schemacie z wygenerowanego klienta", () => {
  it.each([
    "Member",
    "Invitation",
    "User",
    "Organization",
    "Session",
    "Account",
    "Verification",
  ])("model rdzenia %s jest poza guardem", (model) => {
    expect(isTenantScoped(model)).toBe(false);
  });

  it("nieznany model jest poza guardem", () => {
    expect(isTenantScoped("Nope")).toBe(false);
  });

  it("pusta nazwa modelu jest poza guardem", () => {
    expect(isTenantScoped("")).toBe(false);
  });
});

describe("TenantScopeError", () => {
  it("ma name ustawione napisem, model i operację", () => {
    const error = new TenantScopeError("Widget", "findMany");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TenantScopeError);
    expect(error.name).toBe("TenantScopeError");
    expect(error.model).toBe("Widget");
    expect(error.operation).toBe("findMany");
  });
});
