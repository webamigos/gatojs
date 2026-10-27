import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import plMessages from "@/app/messages/pl.json";
import enMessages from "@/app/messages/en.json";
import { ServiceModeProvider } from "../service-mode-provider";
import { ServiceModeBanner } from "../service-mode-banner";

function renderBanner({
  active,
  locale = "pl",
}: {
  active: boolean;
  locale?: "pl" | "en";
}) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "pl" ? plMessages : enMessages}
    >
      <ServiceModeProvider
        active={active}
        organizationId="org-7"
        organizationName="Acme Sp. z o.o."
      >
        <ServiceModeBanner />
      </ServiceModeProvider>
    </NextIntlClientProvider>,
  );
}

describe("ServiceModeBanner", () => {
  it("w trybie serwisowym pokazuje pasek z nazwą organizacji", () => {
    renderBanner({ active: true });

    expect(
      screen.getByText("Tryb serwisowy: Acme Sp. z o.o."),
    ).toBeInTheDocument();
  });

  it("po angielsku pokazuje „Service mode: {name}”", () => {
    renderBanner({ active: true, locale: "en" });

    expect(
      screen.getByText("Service mode: Acme Sp. z o.o."),
    ).toBeInTheDocument();
  });

  it("poza trybem serwisowym nic nie renderuje", () => {
    const { container } = renderBanner({ active: false });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Tryb serwisowy/)).not.toBeInTheDocument();
  });

  it("bez providera nic nie renderuje", () => {
    const { container } = render(
      <NextIntlClientProvider locale="pl" messages={plMessages}>
        <ServiceModeBanner />
      </NextIntlClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
