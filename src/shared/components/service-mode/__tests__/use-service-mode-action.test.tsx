import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import plMessages from "@/app/messages/pl.json";
import enMessages from "@/app/messages/en.json";
import { ServiceModeProvider } from "../service-mode-provider";
import { useServiceModeAction } from "../use-service-mode-action";

const action = vi.fn();

const INPUT = { name: "Anna Nowak" };

function Runner() {
  const { run, dialog } = useServiceModeAction();
  const [outcome, setOutcome] = useState("brak");
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await run(action, INPUT);
          setOutcome(result === null ? "null" : JSON.stringify(result));
        }}
      >
        Uruchom
      </button>
      <output data-testid="outcome">{outcome}</output>
      {dialog}
    </>
  );
}

function renderRunner({
  active,
  locale = "pl",
  withProvider = true,
}: {
  active: boolean;
  locale?: "pl" | "en";
  withProvider?: boolean;
}) {
  const runner = withProvider ? (
    <ServiceModeProvider
      active={active}
      organizationId="org-7"
      organizationName="Acme Sp. z o.o."
    >
      <Runner />
    </ServiceModeProvider>
  ) : (
    <Runner />
  );
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "pl" ? plMessages : enMessages}
    >
      {runner}
    </NextIntlClientProvider>,
  );
}

const FIRST_INPUT = { name: "Pierwsza zmiana" };
const SECOND_INPUT = { name: "Druga zmiana" };

function DoubleRunner() {
  const { run, dialog } = useServiceModeAction();
  const [firstOutcome, setFirstOutcome] = useState("brak");
  const [secondOutcome, setSecondOutcome] = useState("brak");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void run(action, FIRST_INPUT).then((result) =>
            setFirstOutcome(result === null ? "null" : JSON.stringify(result)),
          );
          void run(action, SECOND_INPUT).then((result) =>
            setSecondOutcome(result === null ? "null" : JSON.stringify(result)),
          );
        }}
      >
        Uruchom dwa razy
      </button>
      <output data-testid="first-outcome">{firstOutcome}</output>
      <output data-testid="second-outcome">{secondOutcome}</output>
      {dialog}
    </>
  );
}

function providerTree({
  active,
  organizationId,
  organizationName = "Acme Sp. z o.o.",
  children,
}: {
  active: boolean;
  organizationId: string;
  organizationName?: string;
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider locale="pl" messages={plMessages}>
      <ServiceModeProvider
        active={active}
        organizationId={organizationId}
        organizationName={organizationName}
      >
        {children}
      </ServiceModeProvider>
    </NextIntlClientProvider>
  );
}

async function findConfirmationDialog(title: string) {
  const heading = await screen.findByText(title);
  const dialog = heading.closest('[role="alertdialog"],[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("Brak okna potwierdzenia");
  }
  return within(dialog);
}

describe("useServiceModeAction", () => {
  beforeEach(() => {
    action.mockResolvedValue({ success: true });
  });

  it("poza trybem serwisowym woła akcję od razu, bez okna potwierdzenia", async () => {
    const user = userEvent.setup();
    renderRunner({ active: false });

    await user.click(screen.getByRole("button", { name: "Uruchom" }));

    await waitFor(() =>
      expect(screen.getByTestId("outcome")).toHaveTextContent(
        '{"success":true}',
      ),
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0]).toEqual(INPUT);
    expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument();
  });

  it("bez providera woła akcję od razu, bez okna potwierdzenia", async () => {
    const user = userEvent.setup();
    renderRunner({ active: false, withProvider: false });

    await user.click(screen.getByRole("button", { name: "Uruchom" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][0]).toEqual(INPUT);
    expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument();
  });

  it("w trybie serwisowym otwiera okno z nazwą organizacji i nie woła akcji przed decyzją", async () => {
    const user = userEvent.setup();
    renderRunner({ active: true });

    await user.click(screen.getByRole("button", { name: "Uruchom" }));

    const dialog = await findConfirmationDialog("Tryb serwisowy");
    expect(
      dialog.getByText(
        "Zmieniasz dane organizacji Acme Sp. z o.o. jako serwis Web Amigos.",
      ),
    ).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Anuluj" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Zmień" })).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("„Anuluj” zwraca null i nie woła akcji", async () => {
    const user = userEvent.setup();
    renderRunner({ active: true });

    await user.click(screen.getByRole("button", { name: "Uruchom" }));
    const dialog = await findConfirmationDialog("Tryb serwisowy");
    await user.click(dialog.getByRole("button", { name: "Anuluj" }));

    await waitFor(() =>
      expect(screen.getByTestId("outcome")).toHaveTextContent("null"),
    );
    expect(action).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument(),
    );
  });

  it("„Zmień” woła akcję z potwierdzeniem aktywnej organizacji i zwraca jej wynik", async () => {
    action.mockResolvedValue({ success: true, data: { userId: "u-9" } });
    const user = userEvent.setup();
    renderRunner({ active: true });

    await user.click(screen.getByRole("button", { name: "Uruchom" }));
    const dialog = await findConfirmationDialog("Tryb serwisowy");
    await user.click(dialog.getByRole("button", { name: "Zmień" }));

    await waitFor(() =>
      expect(screen.getByTestId("outcome")).toHaveTextContent(
        '{"success":true,"data":{"userId":"u-9"}}',
      ),
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(INPUT, {
      serviceModeConfirmed: true,
      organizationId: "org-7",
    });
  });

  it("po „Zmień” okno się zamyka, a kolejne uruchomienie znowu pyta o potwierdzenie", async () => {
    const user = userEvent.setup();
    renderRunner({ active: true });

    await user.click(screen.getByRole("button", { name: "Uruchom" }));
    const first = await findConfirmationDialog("Tryb serwisowy");
    await user.click(first.getByRole("button", { name: "Zmień" }));
    await waitFor(() =>
      expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Uruchom" }));
    await findConfirmationDialog("Tryb serwisowy");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("po angielsku okno ma teksty „Service mode”, „Cancel” i „Change”", async () => {
    const user = userEvent.setup();
    renderRunner({ active: true, locale: "en" });

    await user.click(screen.getByRole("button", { name: "Uruchom" }));

    const dialog = await findConfirmationDialog("Service mode");
    expect(
      dialog.getByText(
        "You are changing data of organization Acme Sp. z o.o. as Web Amigos service.",
      ),
    ).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Change" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(INPUT, {
        serviceModeConfirmed: true,
        organizationId: "org-7",
      }),
    );
  });

  describe("dwa uruchomienia przed decyzją", () => {
    it("pierwsze zwraca null bez wywołania akcji, a „Zmień” wykonuje tylko drugie", async () => {
      const user = userEvent.setup();
      render(
        providerTree({
          active: true,
          organizationId: "org-7",
          children: <DoubleRunner />,
        }),
      );

      await user.click(
        screen.getByRole("button", { name: "Uruchom dwa razy" }),
      );

      await waitFor(() =>
        expect(screen.getByTestId("first-outcome")).toHaveTextContent("null"),
      );
      expect(action).not.toHaveBeenCalled();

      const dialog = await findConfirmationDialog("Tryb serwisowy");
      await user.click(dialog.getByRole("button", { name: "Zmień" }));

      await waitFor(() =>
        expect(screen.getByTestId("second-outcome")).toHaveTextContent(
          '{"success":true}',
        ),
      );
      expect(action).toHaveBeenCalledTimes(1);
      expect(action).toHaveBeenCalledWith(SECOND_INPUT, {
        serviceModeConfirmed: true,
        organizationId: "org-7",
      });
      expect(screen.getByTestId("first-outcome")).toHaveTextContent("null");
    });

    it("po „Anuluj” żadna z akcji nie zostaje wywołana", async () => {
      const user = userEvent.setup();
      render(
        providerTree({
          active: true,
          organizationId: "org-7",
          children: <DoubleRunner />,
        }),
      );

      await user.click(
        screen.getByRole("button", { name: "Uruchom dwa razy" }),
      );
      await waitFor(() =>
        expect(screen.getByTestId("first-outcome")).toHaveTextContent("null"),
      );
      expect(action).not.toHaveBeenCalled();

      const dialog = await findConfirmationDialog("Tryb serwisowy");
      await user.click(dialog.getByRole("button", { name: "Anuluj" }));

      await waitFor(() =>
        expect(screen.getByTestId("second-outcome")).toHaveTextContent("null"),
      );
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("zmiana stanu providera bez przemontowania", () => {
    it("nowe organizationId trafia do potwierdzenia", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        providerTree({
          active: true,
          organizationId: "org-7",
          children: <Runner />,
        }),
      );

      rerender(
        providerTree({
          active: true,
          organizationId: "org-8",
          organizationName: "Beta",
          children: <Runner />,
        }),
      );
      await user.click(screen.getByRole("button", { name: "Uruchom" }));
      const dialog = await findConfirmationDialog("Tryb serwisowy");
      expect(
        dialog.getByText(
          "Zmieniasz dane organizacji Beta jako serwis Web Amigos.",
        ),
      ).toBeInTheDocument();
      await user.click(dialog.getByRole("button", { name: "Zmień" }));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(action).toHaveBeenCalledWith(INPUT, {
        serviceModeConfirmed: true,
        organizationId: "org-8",
      });
    });

    it("włączenie trybu serwisowego sprawia, że run pyta o potwierdzenie", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        providerTree({
          active: false,
          organizationId: "org-7",
          children: <Runner />,
        }),
      );

      rerender(
        providerTree({
          active: true,
          organizationId: "org-7",
          children: <Runner />,
        }),
      );
      await user.click(screen.getByRole("button", { name: "Uruchom" }));

      await findConfirmationDialog("Tryb serwisowy");
      expect(action).not.toHaveBeenCalled();
    });

    it("wyłączenie trybu serwisowego sprawia, że run woła akcję od razu", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        providerTree({
          active: true,
          organizationId: "org-7",
          children: <Runner />,
        }),
      );

      rerender(
        providerTree({
          active: false,
          organizationId: "org-7",
          children: <Runner />,
        }),
      );
      await user.click(screen.getByRole("button", { name: "Uruchom" }));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument();
    });
  });
});
