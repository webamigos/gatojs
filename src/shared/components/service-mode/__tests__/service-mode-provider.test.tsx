import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceModeProvider, useServiceMode } from "../service-mode-provider";

function Probe() {
  const serviceMode = useServiceMode();
  return (
    <dl>
      <dt>active</dt>
      <dd data-testid="active">{String(serviceMode.active)}</dd>
      <dt>organizationId</dt>
      <dd data-testid="organization-id">{serviceMode.organizationId}</dd>
      <dt>organizationName</dt>
      <dd data-testid="organization-name">{serviceMode.organizationName}</dd>
    </dl>
  );
}

describe("ServiceModeProvider", () => {
  it("udostępnia stan trybu serwisowego aktywnej organizacji", () => {
    render(
      <ServiceModeProvider
        active
        organizationId="org-7"
        organizationName="Acme Sp. z o.o."
      >
        <Probe />
      </ServiceModeProvider>,
    );

    expect(screen.getByTestId("active")).toHaveTextContent("true");
    expect(screen.getByTestId("organization-id")).toHaveTextContent("org-7");
    expect(screen.getByTestId("organization-name")).toHaveTextContent(
      "Acme Sp. z o.o.",
    );
  });

  it("nieaktywny provider zgłasza brak trybu serwisowego", () => {
    render(
      <ServiceModeProvider
        active={false}
        organizationId="org-7"
        organizationName="Acme Sp. z o.o."
      >
        <Probe />
      </ServiceModeProvider>,
    );

    expect(screen.getByTestId("active")).toHaveTextContent("false");
  });

  it("bez providera tryb serwisowy jest nieaktywny", () => {
    render(<Probe />);

    expect(screen.getByTestId("active")).toHaveTextContent("false");
  });

  it("po zmianie propsów konsument widzi nowe id, nazwę i stan", () => {
    const { rerender } = render(
      <ServiceModeProvider
        active
        organizationId="org-7"
        organizationName="Acme Sp. z o.o."
      >
        <Probe />
      </ServiceModeProvider>,
    );

    rerender(
      <ServiceModeProvider
        active={false}
        organizationId="org-8"
        organizationName="Beta"
      >
        <Probe />
      </ServiceModeProvider>,
    );

    expect(screen.getByTestId("active")).toHaveTextContent("false");
    expect(screen.getByTestId("organization-id")).toHaveTextContent("org-8");
    expect(screen.getByTestId("organization-name")).toHaveTextContent("Beta");
  });

  it("włączenie trybu po zmianie propsów jest widoczne dla konsumenta", () => {
    const { rerender } = render(
      <ServiceModeProvider
        active={false}
        organizationId="org-7"
        organizationName="Acme Sp. z o.o."
      >
        <Probe />
      </ServiceModeProvider>,
    );

    rerender(
      <ServiceModeProvider
        active
        organizationId="org-7"
        organizationName="Acme Sp. z o.o."
      >
        <Probe />
      </ServiceModeProvider>,
    );

    expect(screen.getByTestId("active")).toHaveTextContent("true");
  });
});
