import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PageHeader } from "../page-header";

function headerOf(container: HTMLElement): HTMLElement {
  const header = container.querySelector<HTMLElement>(
    'header[data-slot="page-header"]',
  );
  if (!header) {
    throw new Error("Brak nagłówka strony");
  }
  return header;
}

function strayElements(header: HTMLElement, allowed: Element[]): Element[] {
  return Array.from(header.querySelectorAll("*")).filter(
    (element) =>
      !allowed.some(
        (keep) =>
          keep === element || keep.contains(element) || element.contains(keep),
      ),
  );
}

describe("PageHeader", () => {
  it("renderuje tytuł jako jedyny nagłówek pierwszego poziomu w elemencie header", () => {
    const { container } = render(<PageHeader title="Klucze API" />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Klucze API");
    expect(headings[0].tagName).toBe("H1");
    expect(headerOf(container)).toContainElement(headings[0]);
  });

  it("tytuł nie trafia do nagłówka innego poziomu", () => {
    render(<PageHeader title="Klucze API" />);

    for (const level of [2, 3, 4, 5, 6]) {
      expect(screen.queryByRole("heading", { level })).not.toBeInTheDocument();
    }
  });

  it("tytuł może być elementem React", () => {
    render(<PageHeader title={<span>Konto</span>} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Konto" }),
    ).toBeInTheDocument();
  });

  it("z opisem renderuje go w akapicie wewnątrz nagłówka strony", () => {
    const { container } = render(
      <PageHeader title="Klucze API" description="Opis" />,
    );

    const description = screen.getByText("Opis");
    expect(description.tagName).toBe("P");
    expect(headerOf(container)).toContainElement(description);
  });

  it("opis nie jest częścią nagłówka h1", () => {
    render(<PageHeader title="Klucze API" description="Opis" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Klucze API" }),
    ).not.toHaveTextContent("Opis");
  });

  it("bez opisu w nagłówku nie ma żadnego akapitu", () => {
    const { container } = render(<PageHeader title="Klucze API" />);

    expect(headerOf(container).querySelector("p")).toBeNull();
  });

  it("z akcjami renderuje przycisk wewnątrz nagłówka strony", () => {
    const { container } = render(
      <PageHeader title="Klucze API" actions={<button>Nowy</button>} />,
    );

    expect(
      within(headerOf(container)).getByRole("button", { name: "Nowy" }),
    ).toBeInTheDocument();
  });

  it("bez opisu i akcji nagłówek zawiera tylko blok tytułu, bez pustych opakowań", () => {
    const { container } = render(<PageHeader title="Klucze API" />);
    const header = headerOf(container);
    const heading = screen.getByRole("heading", { level: 1 });

    expect(strayElements(header, [heading])).toEqual([]);
  });

  it("z opisem i bez akcji nagłówek nie zawiera pustego opakowania na akcje", () => {
    const { container } = render(
      <PageHeader title="Klucze API" description="Opis" />,
    );
    const header = headerOf(container);
    const heading = screen.getByRole("heading", { level: 1 });
    const description = screen.getByText("Opis");

    expect(strayElements(header, [heading, description])).toEqual([]);
  });

  it("z akcjami i bez opisu nagłówek nie zawiera akapitu", () => {
    const { container } = render(
      <PageHeader title="Klucze API" actions={<button>Nowy</button>} />,
    );

    expect(headerOf(container).querySelector("p")).toBeNull();
  });
});
