import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const {
  mockRequireModuleAccess,
  mockListAuditLogs,
  mockListActors,
  SERVER_MESSAGES,
} = vi.hoisted(() => ({
  mockRequireModuleAccess: vi.fn(),
  mockListAuditLogs: vi.fn(),
  mockListActors: vi.fn(),
  SERVER_MESSAGES: {
    "audit-logs.title": "Dziennik zdarzeń",
    "audit-logs.description": "Historia zmian w organizacji.",
  } as Record<string, string>,
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(
    async (scope?: string | { namespace?: string }) => (key: string) => {
      const namespace = typeof scope === "string" ? scope : scope?.namespace;
      const value = SERVER_MESSAGES[`${namespace ?? ""}.${key}`];
      return value ?? `${namespace ?? ""}.${key}`;
    },
  ),
}));
vi.mock("@/shared/lib/auth/require-module-access", () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));
vi.mock("@/features/audit-logs/services/queries/audit-log-queries", () => ({
  listAuditLogsQuery: mockListAuditLogs,
  listAuditLogActorsQuery: mockListActors,
}));
vi.mock("@/features/audit-logs/components/audit-log-view", () => ({
  AuditLogView: () => <section aria-label="audit log view" />,
}));

import AuditLogPage from "../page";

async function renderPage() {
  return render(
    await AuditLogPage({
      params: Promise.resolve({ locale: "pl" }),
      searchParams: Promise.resolve({}),
    }),
  );
}

describe("/audit-log", () => {
  beforeEach(() => {
    mockRequireModuleAccess.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      orgRole: "owner",
      userRole: "user",
      serviceMode: false,
    });
    mockListAuditLogs.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    mockListActors.mockResolvedValue([]);
  });

  it("strona jest chroniona dostępem do modułu audit-logs", async () => {
    await renderPage();
    expect(mockRequireModuleAccess).toHaveBeenCalledWith("audit-logs");
  });

  it("ma jeden nagłówek h1 Dziennik zdarzeń we wspólnym nagłówku strony", async () => {
    const { container } = await renderPage();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Dziennik zdarzeń");
    expect(
      container.querySelector('header[data-slot="page-header"]'),
    ).toContainElement(headings[0]);
  });

  it("pokazuje opis strony w nagłówku strony", async () => {
    const { container } = await renderPage();
    expect(
      container.querySelector('header[data-slot="page-header"]'),
    ).toContainElement(screen.getByText("Historia zmian w organizacji."));
  });

  it("widok dziennika jest pod nagłówkiem strony, poza nim", async () => {
    const { container } = await renderPage();
    const header = container.querySelector('header[data-slot="page-header"]');
    const view = screen.getByRole("region", { name: "audit log view" });
    expect(header).not.toContainElement(view);
    expect(
      screen.getByRole("heading", { level: 1 }).compareDocumentPosition(view) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
