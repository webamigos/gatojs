import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import auditLogsPl from "../../i18n/pl.json";
import type { AuditLogRow } from "../../contracts/audit-log.types";

const messages = { ...coreMessages, "audit-logs": auditLogsPl };

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) =>
    createTranslator({
      locale: "pl",
      messages,
      namespace,
    } as Parameters<typeof createTranslator>[0]),
  ),
  getLocale: vi.fn(async () => "pl"),
}));
vi.mock("../../services/queries/audit-trail-query", () => ({
  getEntityAuditTrailQuery: queryMock,
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { AuditTrail } from "../audit-trail";

function makeRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: "row-1",
    createdAt: new Date("2026-10-29T10:00:00Z"),
    action: "member.invited",
    entityType: "delivery",
    entityId: "123",
    actor: { id: "u1", name: "Jan Kowalski", email: "jan@firma.pl" },
    oldData: null,
    newData: null,
    channel: "WEB",
    serviceMode: false,
    ...overrides,
  };
}

async function renderTrail() {
  const element = await AuditTrail({ entityType: "delivery", entityId: "123" });
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("AuditTrail", () => {
  it("pyta o historię właściwej rzeczy", async () => {
    queryMock.mockResolvedValue([]);

    await renderTrail();

    expect(queryMock).toHaveBeenCalledWith("delivery", "123");
  });

  it("brak uprawnień (null) nic nie renderuje i nie daje 404", async () => {
    queryMock.mockResolvedValue(null);

    const element = await AuditTrail({
      entityType: "delivery",
      entityId: "123",
    });
    const { container } = render(<>{element}</>);

    expect(element).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("brak wpisów pokazuje tekst Brak historii", async () => {
    queryMock.mockResolvedValue([]);

    await renderTrail();

    expect(screen.getByText("Brak historii")).toBeInTheDocument();
  });

  it("z wpisami nie pokazuje tekstu Brak historii i wyświetla autora", async () => {
    queryMock.mockResolvedValue([
      makeRow(),
      makeRow({
        id: "row-2",
        action: "member.removed",
        actor: { id: "u2", name: "Anna Nowak", email: "anna@firma.pl" },
      }),
    ]);

    await renderTrail();

    expect(screen.queryByText("Brak historii")).not.toBeInTheDocument();
    expect(screen.getByText(/Jan Kowalski/)).toBeInTheDocument();
    expect(screen.getByText(/Anna Nowak/)).toBeInTheDocument();
  });

  it("zachowuje kolejność wierszy z query", async () => {
    queryMock.mockResolvedValue([
      makeRow({
        id: "r1",
        actor: { id: "u1", name: "Pierwszy Autor", email: "a@a.pl" },
      }),
      makeRow({
        id: "r2",
        actor: { id: "u2", name: "Drugi Autor", email: "b@b.pl" },
      }),
    ]);

    const { container } = await renderTrail();

    const text = container.textContent ?? "";
    expect(text.indexOf("Pierwszy Autor")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Pierwszy Autor")).toBeLessThan(
      text.indexOf("Drugi Autor"),
    );
  });
});
