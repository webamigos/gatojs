import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { auditLogFiltersSchema } from "../audit-log.schemas";

describe("auditLogFiltersSchema", () => {
  it("dla pustego wejścia zwraca wartości domyślne", () => {
    expect(auditLogFiltersSchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortDir: "desc",
    });
  });

  it("zastępuje nieprawidłowe wartości domyślnymi bez wyjątku", () => {
    const parsed = auditLogFiltersSchema.parse({
      page: "-1",
      pageSize: "1000",
      from: "abc",
    });
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.from).toBeUndefined();
  });

  it("zachowuje poprawne pola mimo błędnego sąsiada", () => {
    const parsed = auditLogFiltersSchema.parse({
      page: "3",
      pageSize: "abc",
      sortDir: "asc",
      sortBy: "action",
    });
    expect(parsed).toMatchObject({
      page: 3,
      pageSize: 25,
      sortDir: "asc",
      sortBy: "action",
    });
  });

  it("przyjmuje dozwolone rozmiary strony", () => {
    expect(auditLogFiltersSchema.parse({ pageSize: "10" }).pageSize).toBe(10);
    expect(auditLogFiltersSchema.parse({ pageSize: 50 }).pageSize).toBe(50);
    expect(auditLogFiltersSchema.parse({ pageSize: "100" }).pageSize).toBe(100);
  });

  it("zastępuje nieznane sortBy i sortDir domyślnymi", () => {
    const parsed = auditLogFiltersSchema.parse({
      sortBy: "organizationId",
      sortDir: "sideways",
    });
    expect(parsed.sortBy).toBe("createdAt");
    expect(parsed.sortDir).toBe("desc");
  });

  it("przekazuje filtry tekstowe", () => {
    const parsed = auditLogFiltersSchema.parse({
      userId: "u1",
      action: "member.invited",
      entityType: "delivery",
      entityId: "123",
    });
    expect(parsed).toMatchObject({
      userId: "u1",
      action: "member.invited",
      entityType: "delivery",
      entityId: "123",
    });
  });

  it("ustawia from na początek podanej daty", () => {
    const parsed = auditLogFiltersSchema.parse({ from: "2026-10-29" });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(parsed.from?.toISOString()).toBe("2026-10-29T00:00:00.000Z");
  });

  it("ustawia to na koniec dnia w UTC", () => {
    const parsed = auditLogFiltersSchema.parse({ to: "2026-10-29" });
    expect(parsed.to?.toISOString()).toBe("2026-10-29T23:59:59.999Z");
  });

  it("odrzuca nieprawidłowe to bez wyjątku", () => {
    expect(auditLogFiltersSchema.parse({ to: "abc" }).to).toBeUndefined();
  });

  test.prop([
    fc.oneof(
      fc.integer({ max: 0 }),
      fc.constantFrom("-1", "0", "abc", "1.5", "", "NaN"),
    ),
  ])("niepoprawne page daje stronę 1", (page) => {
    expect(auditLogFiltersSchema.parse({ page }).page).toBe(1);
  });

  test.prop([
    fc
      .integer({ min: -1000, max: 1000 })
      .filter((value) => ![10, 25, 50, 100].includes(value)),
  ])("pageSize spoza dozwolonych daje 25", (pageSize) => {
    expect(auditLogFiltersSchema.parse({ pageSize }).pageSize).toBe(25);
  });

  test.prop([fc.string()])(
    "dowolny tekst w from i to nie rzuca wyjątku",
    (text) => {
      expect(() =>
        auditLogFiltersSchema.parse({ from: text, to: text, page: text }),
      ).not.toThrow();
    },
  );
});

describe("auditLogFiltersSchema: sortDir, przycinanie i wejścia spoza obiektu", () => {
  it("zachowuje sortDir asc i desc", () => {
    expect(auditLogFiltersSchema.parse({ sortDir: "asc" }).sortDir).toBe("asc");
    expect(auditLogFiltersSchema.parse({ sortDir: "desc" }).sortDir).toBe(
      "desc",
    );
  });

  it("nieznany sortDir daje desc", () => {
    expect(auditLogFiltersSchema.parse({ sortDir: "ASC" }).sortDir).toBe(
      "desc",
    );
  });

  it("przycina filtry tekstowe", () => {
    const parsed = auditLogFiltersSchema.parse({
      action: "  member.invited  ",
      entityType: " delivery ",
      entityId: " 123 ",
      userId: " u1 ",
    });
    expect(parsed).toMatchObject({
      action: "member.invited",
      entityType: "delivery",
      entityId: "123",
      userId: "u1",
    });
  });

  it("same spacje w filtrze tekstowym nie ustawiają pola", () => {
    const parsed = auditLogFiltersSchema.parse({
      action: "   ",
      entityId: " ",
    });
    expect(parsed).toEqual({
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortDir: "desc",
    });
    expect("action" in parsed).toBe(false);
    expect("entityId" in parsed).toBe(false);
  });

  it.each([null, undefined, "tekst", 42, true])(
    "wejście %s daje same wartości domyślne",
    (input) => {
      expect(auditLogFiltersSchema.parse(input)).toEqual({
        page: 1,
        pageSize: 25,
        sortBy: "createdAt",
        sortDir: "desc",
      });
    },
  );
});

describe("auditLogFiltersSchema: górna granica page", () => {
  it("page poza zakresem int64 daje stronę 1", () => {
    expect(
      auditLogFiltersSchema.parse({ page: "1000000000000000000" }).page,
    ).toBe(1);
  });

  it("page 1000000 jest akceptowany", () => {
    expect(auditLogFiltersSchema.parse({ page: "1000000" }).page).toBe(1000000);
  });

  it("page 1000001 daje stronę 1", () => {
    expect(auditLogFiltersSchema.parse({ page: "1000001" }).page).toBe(1);
  });
});
