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
