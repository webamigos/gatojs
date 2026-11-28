// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { hasOrganizationColumn, isWithinOrganization } from "../tenant-scope";

describe("isWithinOrganization: where przypięty do organizacji zadania", () => {
  it.each([
    ["findMany", { where: { organizationId: "org-a" } }],
    ["findMany", { where: { organizationId: { equals: "org-a" } } }],
    ["findMany", { where: { organizationId: { in: ["org-a"] } } }],
    [
      "findMany",
      { where: { AND: [{ organizationId: "org-a" }, { id: "x" }] } },
    ],
    [
      "findUnique",
      {
        where: { organizationId_slug: { organizationId: "org-a", slug: "s" } },
      },
    ],
    ["count", { where: { organizationId: "org-a", id: "x" } }],
    ["updateMany", { where: { organizationId: "org-a" }, data: { name: "n" } }],
    ["deleteMany", { where: { organizationId: "org-a" } }],
  ])("%s z %j mieści się w org-a", (operation, args) => {
    expect(isWithinOrganization(operation, args, "org-a")).toBe(true);
  });

  it.each([
    ["findMany", { where: { organizationId: "org-b" } }],
    ["findMany", { where: { organizationId: { equals: "org-b" } } }],
    ["findMany", { where: { organizationId: { in: ["org-a", "org-b"] } } }],
    ["findMany", { where: { organizationId: { in: ["org-b", "org-a"] } } }],
    ["findMany", { where: { organizationId: { not: "org-b" } } }],
    ["findMany", { where: { organizationId: { in: [] } } }],
    ["findMany", {}],
    ["findMany", { where: {} }],
    ["findMany", { where: { id: "x" } }],
    [
      "findMany",
      {
        where: {
          OR: [{ organizationId: "org-a" }, { organizationId: "org-b" }],
        },
      },
    ],
    [
      "findMany",
      { where: { AND: [{ organizationId: "org-b" }, { id: "x" }] } },
    ],
    [
      "findUnique",
      {
        where: { organizationId_slug: { organizationId: "org-b", slug: "s" } },
      },
    ],
    ["updateMany", { where: { organizationId: "org-b" }, data: { name: "n" } }],
    ["deleteMany", { where: { organizationId: "org-b" } }],
  ])("%s z %j wychodzi poza org-a", (operation, args) => {
    expect(isWithinOrganization(operation, args, "org-a")).toBe(false);
  });

  it("{ equals: org-b } nie jest traktowane jak napis org-a", () => {
    expect(
      isWithinOrganization(
        "findMany",
        { where: { organizationId: { equals: "org-b" } } },
        "org-a",
      ),
    ).toBe(false);
    expect(
      isWithinOrganization(
        "findMany",
        { where: { organizationId: { equals: "org-a" } } },
        "org-a",
      ),
    ).toBe(true);
  });
});

describe("isWithinOrganization: zapisy", () => {
  it("create z organizationId org-a mieści się w org-a", () => {
    expect(
      isWithinOrganization(
        "create",
        { data: { organizationId: "org-a", name: "n" } },
        "org-a",
      ),
    ).toBe(true);
  });

  it("create z organizationId org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "create",
        { data: { organizationId: "org-b" } },
        "org-a",
      ),
    ).toBe(false);
  });

  it("create bez organizationId wychodzi poza org-a", () => {
    expect(
      isWithinOrganization("create", { data: { name: "n" } }, "org-a"),
    ).toBe(false);
  });

  it("createMany z samymi wierszami org-a mieści się w org-a", () => {
    expect(
      isWithinOrganization(
        "createMany",
        { data: [{ organizationId: "org-a" }, { organizationId: "org-a" }] },
        "org-a",
      ),
    ).toBe(true);
  });

  it("createMany z drugim wierszem org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "createMany",
        { data: [{ organizationId: "org-a" }, { organizationId: "org-b" }] },
        "org-a",
      ),
    ).toBe(false);
  });

  it("createMany z ostatnim z trzech wierszy org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "createMany",
        {
          data: [
            { organizationId: "org-a" },
            { organizationId: "org-a" },
            { organizationId: "org-b" },
          ],
        },
        "org-a",
      ),
    ).toBe(false);
  });

  it("createManyAndReturn z wierszem org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "createManyAndReturn",
        { data: [{ organizationId: "org-a" }, { organizationId: "org-b" }] },
        "org-a",
      ),
    ).toBe(false);
  });

  it("update w org-a zmieniający tylko nazwę mieści się w org-a", () => {
    expect(
      isWithinOrganization(
        "update",
        { where: { id: "x", organizationId: "org-a" }, data: { name: "n" } },
        "org-a",
      ),
    ).toBe(true);
  });

  it("update przenoszący wiersz do org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "update",
        {
          where: { id: "x", organizationId: "org-a" },
          data: { organizationId: "org-b" },
        },
        "org-a",
      ),
    ).toBe(false);
  });

  it("create z zagnieżdżonym wierszem org-b w data wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "create",
        {
          data: {
            organizationId: "org-a",
            items: { create: [{ organizationId: "org-b" }] },
          },
        },
        "org-a",
      ),
    ).toBe(false);
  });

  it("update z zagnieżdżonym wierszem org-b w data wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "update",
        {
          where: { id: "x", organizationId: "org-a" },
          data: { items: { create: [{ organizationId: "org-b" }] } },
        },
        "org-a",
      ),
    ).toBe(false);
  });

  it("create podłączający relację organization do org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "create",
        {
          data: {
            organizationId: "org-a",
            organization: { connect: { id: "org-b" } },
          },
        },
        "org-a",
      ),
    ).toBe(false);
  });

  it("upsert z where i create przypiętymi do org-a mieści się w org-a", () => {
    expect(
      isWithinOrganization(
        "upsert",
        {
          where: { id: "x", organizationId: "org-a" },
          create: { organizationId: "org-a", name: "n" },
          update: { name: "n" },
        },
        "org-a",
      ),
    ).toBe(true);
  });

  it("upsert z create.organizationId org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "upsert",
        {
          where: { id: "x", organizationId: "org-a" },
          create: { organizationId: "org-b" },
          update: { name: "n" },
        },
        "org-a",
      ),
    ).toBe(false);
  });

  it("upsert z where org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "upsert",
        {
          where: { id: "x", organizationId: "org-b" },
          create: { organizationId: "org-a" },
          update: { name: "n" },
        },
        "org-a",
      ),
    ).toBe(false);
  });
});

const organizationIdArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((value) => value.trim() !== "");

const twoOrganizations = fc
  .tuple(organizationIdArb, organizationIdArb)
  .filter(([a, b]) => a !== b);

describe("isWithinOrganization: niezmienniki", () => {
  test.prop([organizationIdArb])(
    "findMany z organizationId równym organizacji zadania mieści się w niej",
    (a) => {
      expect(
        isWithinOrganization("findMany", { where: { organizationId: a } }, a),
      ).toBe(true);
    },
  );

  test.prop([twoOrganizations])(
    "findMany z organizationId innej organizacji wychodzi poza organizację zadania",
    ([a, b]) => {
      expect(
        isWithinOrganization("findMany", { where: { organizationId: b } }, a),
      ).toBe(false);
    },
  );

  test.prop([twoOrganizations])(
    "{ in: [a, b] } wychodzi poza organizację zadania a",
    ([a, b]) => {
      expect(
        isWithinOrganization(
          "findMany",
          { where: { organizationId: { in: [a, b] } } },
          a,
        ),
      ).toBe(false);
    },
  );

  test.prop([twoOrganizations, fc.nat({ max: 5 }), fc.nat({ max: 5 })])(
    "createMany z wierszem innej organizacji na dowolnej pozycji wychodzi poza organizację zadania",
    ([a, b], before, after) => {
      const data = [
        ...Array.from({ length: before }, () => ({ organizationId: a })),
        { organizationId: b },
        ...Array.from({ length: after }, () => ({ organizationId: a })),
      ];
      expect(isWithinOrganization("createMany", { data }, a)).toBe(false);
    },
  );
});

describe("hasOrganizationColumn", () => {
  it.each(["AuditLog", "Member", "Invitation"])(
    "%s ma kolumnę organizationId",
    (model) => {
      expect(hasOrganizationColumn(model)).toBe(true);
    },
  );

  it.each(["User", "Organization", "NieMaTakiegoModelu"])(
    "%s nie ma kolumny organizationId",
    (model) => {
      expect(hasOrganizationColumn(model)).toBe(false);
    },
  );
});

describe("isWithinOrganization: przypadki brzegowe where", () => {
  it.each([
    ["NOT z organizacją zadania", { NOT: { organizationId: "org-a" } }],
    [
      "filtr relacji z organizacją zadania",
      { parent: { organizationId: "org-a" } },
    ],
    [
      "organizationId zagnieżdżone w wartości organizationId",
      { organizationId: { organizationId: "org-a" } },
    ],
    ["pusty OR", { OR: [] }],
  ])("%s wychodzi poza org-a", (_label, where) => {
    expect(isWithinOrganization("findMany", { where }, "org-a")).toBe(false);
  });

  it("OR z dwiema gałęziami przypiętymi do org-a mieści się w org-a", () => {
    expect(
      isWithinOrganization(
        "findMany",
        {
          where: {
            OR: [
              { organizationId: "org-a", id: "x" },
              { organizationId: "org-a", id: "y" },
            ],
          },
        },
        "org-a",
      ),
    ).toBe(true);
  });

  it("args undefined wychodzi poza org-a", () => {
    expect(isWithinOrganization("findMany", undefined, "org-a")).toBe(false);
  });

  it("nieznana operacja findRaw z where i create w org-a wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "findRaw",
        {
          where: { organizationId: "org-a" },
          create: { organizationId: "org-a" },
        },
        "org-a",
      ),
    ).toBe(false);
  });
});

describe("isWithinOrganization: przypadki brzegowe zapisów", () => {
  it.each([
    ["organizationId { set: org-a }", { organizationId: { set: "org-a" } }],
    [
      "organization.connect do org-a",
      { organization: { connect: { id: "org-a" } } },
    ],
  ])("update z %s mieści się w org-a", (_label, data) => {
    expect(
      isWithinOrganization(
        "update",
        { where: { id: "x", organizationId: "org-a" }, data },
        "org-a",
      ),
    ).toBe(true);
  });

  it.each([
    ["organizationId { set: org-b }", { organizationId: { set: "org-b" } }],
    [
      "organization.connect do org-a z create org-b",
      {
        organization: { connect: { id: "org-a" }, create: { id: "org-b" } },
      },
    ],
    ["organization jako napis org-b", { organization: "org-b" }],
  ])("update z %s wychodzi poza org-a", (_label, data) => {
    expect(
      isWithinOrganization(
        "update",
        { where: { id: "x", organizationId: "org-a" }, data },
        "org-a",
      ),
    ).toBe(false);
  });

  it("create z zagnieżdżoną listą, w której drugi wiersz jest w org-b, wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "create",
        {
          data: {
            organizationId: "org-a",
            items: {
              create: [
                { organizationId: "org-a" },
                { organizationId: "org-b" },
              ],
            },
          },
        },
        "org-a",
      ),
    ).toBe(false);
  });

  it("create z zagnieżdżonym wierszem org-a mieści się w org-a", () => {
    expect(
      isWithinOrganization(
        "create",
        {
          data: {
            organizationId: "org-a",
            items: { create: [{ organizationId: "org-a" }] },
          },
        },
        "org-a",
      ),
    ).toBe(true);
  });

  it("create z polem listowym napisów obok organizacji zadania mieści się w org-a", () => {
    expect(
      isWithinOrganization(
        "create",
        {
          data: {
            organizationId: "org-a",
            tags: ["x"],
            items: { create: [{ organizationId: "org-a" }] },
          },
        },
        "org-a",
      ),
    ).toBe(true);
  });

  it("createMany z pojedynczym obiektem org-b wychodzi poza org-a", () => {
    expect(
      isWithinOrganization(
        "createMany",
        { data: { organizationId: "org-b" } },
        "org-a",
      ),
    ).toBe(false);
  });

  it("createMany z pojedynczym obiektem org-a mieści się w org-a", () => {
    expect(
      isWithinOrganization(
        "createMany",
        { data: { organizationId: "org-a" } },
        "org-a",
      ),
    ).toBe(true);
  });

  it.each([
    ["organizationId org-b", { organizationId: "org-b" }],
    [
      "organization.connect do org-b",
      { organization: { connect: { id: "org-b" } } },
    ],
  ])("upsert z update %s wychodzi poza org-a", (_label, update) => {
    expect(
      isWithinOrganization(
        "upsert",
        {
          where: { id: "x", organizationId: "org-a" },
          create: { organizationId: "org-a" },
          update,
        },
        "org-a",
      ),
    ).toBe(false);
  });
});

type NestedPayload = Record<string, unknown>;

function leakingLeaf(kind: number, other: string): NestedPayload {
  if (kind === 0) {
    return { organizationId: other };
  }
  if (kind === 1) {
    return { organizationId: { set: other } };
  }
  return { organization: { connect: { id: other } } };
}

function nestAtDepth(leaf: NestedPayload, depth: number): NestedPayload {
  if (depth === 0) {
    return leaf;
  }
  return { name: "n", items: { create: [nestAtDepth(leaf, depth - 1)] } };
}

describe("isWithinOrganization: wyciek na dowolnej głębokości", () => {
  test.prop([
    twoOrganizations,
    fc.integer({ min: 0, max: 2 }),
    fc.nat({ max: 4 }),
    fc.boolean(),
  ])(
    "id innej organizacji na dowolnej głębokości data wychodzi poza organizację zadania",
    ([a, b], kind, depth, asSecondElement) => {
      const leaked = nestAtDepth(leakingLeaf(kind, b), depth);
      const rows = asSecondElement ? [{ organizationId: a }, leaked] : [leaked];
      expect(
        isWithinOrganization(
          "create",
          { data: { organizationId: a, items: { create: rows } } },
          a,
        ),
      ).toBe(false);
    },
  );
});
