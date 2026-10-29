import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import auditLogsPl from "../../i18n/pl.json";
import type { AuditLogRow } from "../../contracts/audit-log.types";

const messages = {
  ...coreMessages,
  "audit-logs": auditLogsPl,
  warehouse: { auditActions: { deliveryReceived: "Przyjęcie dostawy" } },
};

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
vi.mock("@/modules.client.generated", () => ({
  clientModules: [
    {
      key: "warehouse",
      nav: [],
      routePrefixes: [],
      auditActions: [
        {
          action: "delivery.received",
          labelKey: "auditActions.deliveryReceived",
        },
      ],
    },
    {
      key: "audit-logs",
      nav: [],
      routePrefixes: [],
      auditActions: [
        { action: "member.invited", labelKey: "action-member-invited" },
      ],
    },
  ],
}));

import { AuditLogView } from "../audit-log-view";

function makeRow(action: string): AuditLogRow {
  return {
    id: "row-1",
    createdAt: new Date("2026-10-29T10:00:00Z"),
    action,
    entityType: "delivery",
    entityId: "1",
    actor: null,
    oldData: null,
    newData: null,
    channel: "WEB",
    serviceMode: false,
  };
}

function renderView(action: string) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <AuditLogView
        result={{
          items: [makeRow(action)],
          totalItems: 1,
          totalPages: 1,
          currentPage: 1,
          pageSize: 25,
        }}
        filters={{
          page: 1,
          pageSize: 25,
          sortBy: "createdAt",
          sortDir: "desc",
        }}
        actors={[]}
      />
    </NextIntlClientProvider>,
  );
}

describe("AuditLogView etykiety akcji innych modułów", () => {
  it("pokazuje etykietę z namespace modułu deklarującego akcję", () => {
    renderView("delivery.received");

    expect(screen.getAllByText("Przyjęcie dostawy").length).toBeGreaterThan(0);
    expect(screen.queryByText("delivery.received")).toBeNull();
  });

  it("pokazuje etykietę akcji zadeklarowanej przez audit-logs", () => {
    renderView("member.invited");

    expect(screen.getAllByText("Zaproszenie członka").length).toBeGreaterThan(
      0,
    );
  });

  it("pokazuje surowy klucz dla niezadeklarowanej akcji", () => {
    renderView("invoice.voided");

    expect(screen.getByText("invoice.voided")).toBeInTheDocument();
  });
});
