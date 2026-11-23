import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import coreMessagesEn from "@/app/messages/en.json";
import coreMessagesPl from "@/app/messages/pl.json";
import { DataTable, type ColumnDef } from "../data-table";

type Row = { name: string };

const columns: ColumnDef<Row>[] = [{ accessorKey: "name", header: "Name" }];

const pagination = {
  page: 1,
  pageSize: 25,
  total: 0,
  onPageChange: () => undefined,
  onPageSizeChange: () => undefined,
};

function withMessages(locale: "pl" | "en", children: ReactNode) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? coreMessagesEn : coreMessagesPl}
    >
      {children}
    </NextIntlClientProvider>
  );
}

describe("DataTable: domyślne etykiety z common.dataTable", () => {
  it("en bez propsów etykiet → Rows per page, Previous, Next, No results.", () => {
    render(
      withMessages(
        "en",
        <DataTable columns={columns} data={[]} pagination={pagination} />,
      ),
    );

    expect(screen.getByText("No results.")).toBeInTheDocument();
    expect(screen.getByText("Rows per page")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.queryByText("Brak wyników.")).not.toBeInTheDocument();
    expect(screen.queryByText("Wierszy na stronę")).not.toBeInTheDocument();
  });

  it("pl bez propsów etykiet → Wierszy na stronę, Poprzednia, Następna, Brak wyników.", () => {
    render(
      withMessages(
        "pl",
        <DataTable columns={columns} data={[]} pagination={pagination} />,
      ),
    );

    expect(screen.getByText("Brak wyników.")).toBeInTheDocument();
    expect(screen.getByText("Wierszy na stronę")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Poprzednia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Następna" }),
    ).toBeInTheDocument();
  });

  it("jawne propsy etykiet wygrywają z tłumaczeniami", () => {
    render(
      withMessages(
        "en",
        <DataTable
          columns={columns}
          data={[]}
          pagination={pagination}
          emptyMessage="Nothing here"
          pageSizeLabel="Per page"
          previousLabel="Back"
          nextLabel="Forward"
        />,
      ),
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Per page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward" })).toBeInTheDocument();
    expect(screen.queryByText("No results.")).not.toBeInTheDocument();
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
  });
});
