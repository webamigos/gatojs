import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { usersMessages } from "./messages";

const { mockStopImpersonating, mockPush, mockRefresh, mockToastError } =
  vi.hoisted(() => ({
    mockStopImpersonating: vi.fn(),
    mockPush: vi.fn(),
    mockRefresh: vi.fn(),
    mockToastError: vi.fn(),
  }));

vi.mock("@/shared/lib/auth/client", () => ({
  authClient: { admin: { stopImpersonating: mockStopImpersonating } },
}));
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));
vi.mock("sonner", () => ({ toast: { error: mockToastError } }));

import { ImpersonationBanner } from "../impersonation-banner";

const onStopLogged = vi.fn();

function renderBanner(active: boolean) {
  return render(
    <NextIntlClientProvider locale="pl" messages={usersMessages}>
      <ImpersonationBanner
        active={active}
        userName="Jan Kowalski"
        onStopLogged={onStopLogged}
      />
    </NextIntlClientProvider>,
  );
}

const STOP_BUTTON = { name: "Wróć do własnego konta" };

describe("ImpersonationBanner", () => {
  beforeEach(() => {
    onStopLogged.mockResolvedValue({ success: true });
    mockStopImpersonating.mockResolvedValue({ error: null });
  });

  it("nic nie renderuje, gdy nieaktywny", () => {
    const { container } = renderBanner(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("pokazuje nazwę impersonowanego użytkownika", () => {
    renderBanner(true);
    expect(
      screen.getByText(/Zalogowano jako Jan Kowalski/),
    ).toBeInTheDocument();
  });

  it("kończy impersonację przez locale-aware router", async () => {
    const user = userEvent.setup();
    renderBanner(true);

    await user.click(screen.getByRole("button", STOP_BUTTON));

    expect(onStopLogged).toHaveBeenCalled();
    expect(mockStopImpersonating).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/users");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("zapis zdarzenia poprzedza zakończenie impersonacji", async () => {
    const order: string[] = [];
    onStopLogged.mockImplementation(async () => {
      order.push("log");
      return { success: true };
    });
    mockStopImpersonating.mockImplementation(async () => {
      order.push("stop");
      return { error: null };
    });
    const user = userEvent.setup();
    renderBanner(true);

    await user.click(screen.getByRole("button", STOP_BUTTON));

    expect(order).toEqual(["log", "stop"]);
  });

  it("błąd zakończenia → toast i brak nawigacji", async () => {
    mockStopImpersonating.mockResolvedValue({ error: { message: "boom" } });
    const user = userEvent.setup();
    renderBanner(true);

    await user.click(screen.getByRole("button", STOP_BUTTON));

    expect(mockToastError).toHaveBeenCalledWith(
      "Nie udało się zakończyć impersonacji",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("błąd zapisu zdarzenia nie blokuje zakończenia impersonacji", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    onStopLogged.mockResolvedValue({ success: false, error: "db down" });
    const user = userEvent.setup();
    renderBanner(true);

    await user.click(screen.getByRole("button", STOP_BUTTON));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/users"));
    expect(mockStopImpersonating).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("nieoczekiwany wyjątek → toast i odblokowany przycisk", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockStopImpersonating.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderBanner(true);

    const button = screen.getByRole("button", STOP_BUTTON);
    await user.click(button);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Nie udało się zakończyć impersonacji",
      ),
    );
    expect(button).not.toBeDisabled();
    consoleError.mockRestore();
  });
});
