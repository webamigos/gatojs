import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import auditLogsPl from "../../i18n/pl.json";
import type { PaginatedResult } from "@/shared/types/common";
import type {
  AuditLogFilters,
  AuditLogRow,
} from "../../contracts/audit-log.types";

const { stableRouter } = vi.hoisted(() => ({
  stableRouter: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => stableRouter,
  usePathname: () => "/audit-log",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  usePathname: () => "/audit-log",
  useSearchParams: () => new URLSearchParams(),
}));

import { AuditLogView } from "../audit-log-view";

const messages = { ...coreMessages, "audit-logs": auditLogsPl };

const FILTERS: AuditLogFilters = {
  page: 1,
  pageSize: 25,
  sortBy: "createdAt",
  sortDir: "desc",
};

function makeRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: "row-1",
    createdAt: new Date("2026-10-29T10:00:00Z"),
    action: "member.invited",
    entityType: "member",
    entityId: "m1",
    actor: { id: "u1", name: "Jan Kowalski", email: "jan@firma.pl" },
    oldData: null,
    newData: null,
    channel: "WEB",
    serviceMode: false,
    ...overrides,
  };
}

function renderView(rows: AuditLogRow[]) {
  const result: PaginatedResult<AuditLogRow> = {
    items: rows,
    totalItems: rows.length,
    totalPages: 1,
    currentPage: 1,
    pageSize: 25,
  };
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <AuditLogView
        result={result}
        filters={FILTERS}
        actors={[{ id: "u1", name: "Jan Kowalski" }]}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuditLogView", () => {
  it("pokazuje etykietę z i18n dla zadeklarowanej akcji member.invited", () => {
    renderView([makeRow({ action: "member.invited" })]);

    expect(screen.getAllByText("Zaproszenie członka").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("member.invited")).toBeNull();
  });

  it("pokazuje surowy action, gdy akcja nie ma deklaracji", () => {
    renderView([makeRow({ action: "delivery.received" })]);

    expect(screen.getByText("delivery.received")).toBeInTheDocument();
  });

  it("oznacza wpis z trybu serwisowego", () => {
    renderView([makeRow({ serviceMode: true })]);

    expect(screen.getByText(/tryb serwisowy/i)).toBeInTheDocument();
  });

  it("nie oznacza trybu serwisowego dla zwykłego wpisu", () => {
    renderView([makeRow({ serviceMode: false })]);

    expect(screen.queryByText(/tryb serwisowy/i)).toBeNull();
  });

  it("oznacza wpis z kanału API", () => {
    renderView([makeRow({ channel: "API" })]);

    expect(screen.getByText("API")).toBeInTheDocument();
  });

  it("nie oznacza API dla wpisu z kanału WEB", () => {
    renderView([makeRow({ channel: "WEB" })]);

    expect(screen.queryByText("API")).toBeNull();
  });

  it("pokazuje autora wpisu", () => {
    renderView([makeRow()]);

    expect(screen.getAllByText(/Jan Kowalski/).length).toBeGreaterThan(0);
  });

  it.each([
    ["entityType", "Typ obiektu", "delivery"],
    ["entityId", "Identyfikator obiektu", "123"],
  ] as const)(
    "po wyczyszczeniu filtra %s pole jest puste",
    (key, label, value) => {
      const emptyResult: PaginatedResult<AuditLogRow> = {
        items: [],
        totalItems: 0,
        totalPages: 1,
        currentPage: 1,
        pageSize: 25,
      };
      const tree = (filters: AuditLogFilters) => (
        <NextIntlClientProvider locale="pl" messages={messages}>
          <AuditLogView result={emptyResult} filters={filters} actors={[]} />
        </NextIntlClientProvider>
      );
      const { rerender } = render(tree({ ...FILTERS, [key]: value }));
      expect(screen.getByLabelText(label)).toHaveValue(value);

      rerender(tree(FILTERS));

      expect(screen.getByLabelText(label)).toHaveValue("");
    },
  );
});
