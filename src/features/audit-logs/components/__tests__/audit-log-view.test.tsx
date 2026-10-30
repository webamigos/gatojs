import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import auditLogsPl from "../../i18n/pl.json";
import type { PaginatedResult } from "@/shared/types/common";
import type {
  AuditLogFilters,
  AuditLogRow,
} from "../../contracts/audit-log.types";

const { stableRouter, currentSearch } = vi.hoisted(() => ({
  stableRouter: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  currentSearch: { value: "" },
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
  useSearchParams: () => new URLSearchParams(currentSearch.value),
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
  currentSearch.value = "";
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

const EMPTY_RESULT: PaginatedResult<AuditLogRow> = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  currentPage: 1,
  pageSize: 25,
};

function filterTree(filters: AuditLogFilters) {
  return (
    <NextIntlClientProvider locale="pl" messages={messages}>
      <AuditLogView result={EMPTY_RESULT} filters={filters} actors={[]} />
    </NextIntlClientProvider>
  );
}

function pushedUrl(): URL {
  expect(stableRouter.push).toHaveBeenCalledTimes(1);
  return new URL(String(stableRouter.push.mock.calls[0][0]), "http://test");
}

describe.each([
  ["entityType", "Typ obiektu"],
  ["entityId", "Identyfikator obiektu"],
] as const)("AuditLogView: pole filtra %s", (key, label) => {
  it("blur bez zmiany wartości nie zmienia adresu", async () => {
    const user = userEvent.setup();
    render(filterTree({ ...FILTERS, [key]: "delivery" }));

    await user.click(screen.getByLabelText(label));
    await user.tab();

    expect(stableRouter.push).not.toHaveBeenCalled();
  });

  it("blur pustego pola przy braku filtra nie zmienia adresu", async () => {
    const user = userEvent.setup();
    render(filterTree(FILTERS));

    await user.click(screen.getByLabelText(label));
    await user.tab();

    expect(stableRouter.push).not.toHaveBeenCalled();
  });

  it("blur z wartością różną od filtra tylko spacjami nie zmienia adresu", async () => {
    const user = userEvent.setup();
    render(filterTree({ ...FILTERS, [key]: "delivery" }));
    const input = screen.getByLabelText(label);

    await user.clear(input);
    await user.type(input, "  delivery  ");
    await user.tab();

    expect(stableRouter.push).not.toHaveBeenCalled();
  });

  it("blur ze zmianą wartości przechodzi raz pod adres z nowym filtrem i bez strony", async () => {
    const user = userEvent.setup();
    render(filterTree({ ...FILTERS, page: 3 }));

    await user.type(screen.getByLabelText(label), "delivery");
    await user.tab();

    const url = pushedUrl();
    expect(url.pathname).toBe("/audit-log");
    expect(url.searchParams.get(key)).toBe("delivery");
    expect(url.searchParams.has("page")).toBe(false);
  });

  it("nowe filtry po blur nie nadpisują tekstu wpisywanego ponownie w pole z fokusem", async () => {
    const user = userEvent.setup();
    const { rerender } = render(filterTree(FILTERS));
    const input = screen.getByLabelText(label);

    await user.type(input, "delivery");
    await user.tab();
    await user.click(input);
    await user.type(input, "-2");

    rerender(filterTree({ ...FILTERS, [key]: "delivery" }));

    const after = screen.getByLabelText(label);
    expect(after).toBe(input);
    expect(after).toHaveValue("delivery-2");
    expect(after).toHaveFocus();
  });

  it("po blur i wyczyszczeniu filtrów pole bez fokusu pokazuje pustą wartość", async () => {
    const user = userEvent.setup();
    const { rerender } = render(filterTree(FILTERS));
    const input = screen.getByLabelText(label);

    await user.type(input, "delivery");
    await user.tab();
    rerender(filterTree({ ...FILTERS, [key]: "delivery" }));
    rerender(filterTree(FILTERS));

    expect(screen.getByLabelText(label)).toHaveValue("");
    expect(screen.getByLabelText(label)).not.toHaveFocus();
  });

  it("pole bez fokusu przyjmuje nową wartość z filtrów", () => {
    const { rerender } = render(filterTree({ ...FILTERS, [key]: "a" }));

    rerender(filterTree({ ...FILTERS, [key]: "b" }));

    expect(screen.getByLabelText(label)).toHaveValue("b");
  });
});

describe("AuditLogView: kolumna daty", () => {
  const CREATED_AT_ISO = "2026-10-29T10:00:00.000Z";
  const FORMATTED_IN_WARSAW = "29 paź 2026 11:00:00";

  beforeAll(() => {
    vi.stubEnv("TZ", "Europe/Warsaw");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  function oneRowTree() {
    return (
      <NextIntlClientProvider locale="pl" messages={messages}>
        <AuditLogView
          result={{
            items: [makeRow({ createdAt: new Date(CREATED_AT_ISO) })],
            totalItems: 1,
            totalPages: 1,
            currentPage: 1,
            pageSize: 25,
          }}
          filters={FILTERS}
          actors={[]}
        />
      </NextIntlClientProvider>
    );
  }

  it("HTML z serwera zawiera element time z datetime w ISO", () => {
    const html = renderToString(oneRowTree());
    const doc = new DOMParser().parseFromString(html, "text/html");

    const times = Array.from(doc.querySelectorAll("time"));
    expect(times.map((time) => time.getAttribute("datetime"))).toEqual([
      CREATED_AT_ISO,
    ]);
  });

  it("HTML z serwera nie zawiera czasu sformatowanego w strefie serwera", () => {
    const html = renderToString(oneRowTree());
    const text = new DOMParser().parseFromString(html, "text/html").body
      .textContent;

    expect(text).not.toContain(FORMATTED_IN_WARSAW);
    expect(text).not.toContain("29 paź 2026");
    expect(text).not.toContain("11:00");
  });

  it("po zamontowaniu w przeglądarce pokazuje czas lokalny w elemencie time", () => {
    render(oneRowTree());

    const formatted = screen.getByText(FORMATTED_IN_WARSAW);
    const time = formatted.closest("time");
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute("datetime", CREATED_AT_ISO);
  });
});

describe("AuditLogView: pola dat od i do", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "Europe/Warsaw");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("pokazują dzień z adresu, nie dzień przeliczony przez UTC", () => {
    currentSearch.value = "from=2026-10-29&to=2026-10-30";

    render(
      filterTree({
        ...FILTERS,
        from: new Date(2026, 9, 29, 0, 0, 0, 0),
        to: new Date(2026, 9, 30, 23, 59, 59, 999),
      }),
    );

    expect(screen.getByLabelText("Od")).toHaveValue("2026-10-29");
    expect(screen.getByLabelText("Do")).toHaveValue("2026-10-30");
  });

  it("są puste, gdy schemat odrzucił datę z adresu", () => {
    currentSearch.value = "from=2026-02-30&to=2026-02-30";

    render(filterTree(FILTERS));

    expect(screen.getByLabelText("Od")).toHaveValue("");
    expect(screen.getByLabelText("Do")).toHaveValue("");
  });
});
