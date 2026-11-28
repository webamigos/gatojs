import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi, beforeEach } from "vitest";
import coreMessages from "@/app/messages/pl.json";

const {
  mockUpdateAccountName,
  mockToastError,
  mockToastSuccess,
  mockRefresh,
  mockPush,
} = vi.hoisted(() => ({
  mockUpdateAccountName: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockRefresh: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock(
  "@/features/account/services/commands/update-account-name-command",
  () => ({
    updateAccountNameCommand: mockUpdateAccountName,
  }),
);
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));
vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

import { AccountNameForm } from "../account-name-form";

const messages = {
  ...coreMessages,
  account: {
    nav: "Konto",
    title: "Konto",
    "user-data": "Dane użytkownika",
    name: "Imię i nazwisko",
    email: "Email",
    description: "Zarządzaj swoimi danymi i hasłem.",
    "save-name": "Zapisz",
    "name-saved": "Zapisano imię i nazwisko",
    "name-invalid": "Podaj imię i nazwisko (od 1 do 100 znaków).",
  },
};

const INVALID = "Podaj imię i nazwisko (od 1 do 100 znaków).";

function renderForm(defaultName = "hello") {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <AccountNameForm defaultName={defaultName} />
    </NextIntlClientProvider>,
  );
}

function nameInput(): HTMLElement {
  return screen.getByRole("textbox", { name: "Imię i nazwisko" });
}

async function submitName(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
) {
  await user.clear(nameInput());
  if (value !== "") {
    await user.type(nameInput(), value);
  }
  await user.click(screen.getByRole("button", { name: "Zapisz" }));
}

describe("AccountNameForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateAccountName.mockResolvedValue({
      success: true,
      data: { name: "Jan Kowalski" },
    });
  });

  it("pole Imię i nazwisko ma wartość domyślną i id account-name", () => {
    renderForm("hello");

    expect(nameInput()).toHaveValue("hello");
    expect(nameInput()).toHaveAttribute("id", "account-name");
  });

  it("wysyła komendzie wpisane imię i nazwisko", async () => {
    const user = userEvent.setup();
    renderForm("hello");

    await submitName(user, "Jan Kowalski");

    await waitFor(() =>
      expect(mockUpdateAccountName).toHaveBeenCalledWith({
        name: "Jan Kowalski",
      }),
    );
    expect(mockUpdateAccountName).toHaveBeenCalledTimes(1);
  });

  it("bez zmiany wysyła wartość domyślną", async () => {
    const user = userEvent.setup();
    renderForm("hello");

    await user.click(screen.getByRole("button", { name: "Zapisz" }));

    await waitFor(() =>
      expect(mockUpdateAccountName).toHaveBeenCalledWith({ name: "hello" }),
    );
  });

  it("po sukcesie pokazuje toast i odświeża widok", async () => {
    const user = userEvent.setup();
    renderForm("hello");

    await submitName(user, "Jan Kowalski");

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("Zapisano imię i nazwisko"),
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("błąd komendy → toast z treścią z serwera, bez odświeżenia i bez toastu sukcesu", async () => {
    mockUpdateAccountName.mockResolvedValue({
      success: false,
      error: "Błąd X",
    });
    const user = userEvent.setup();
    renderForm("hello");

    await submitName(user, "Jan Kowalski");

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Błąd X"));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("puste pole → komunikat walidacji, komenda niewołana", async () => {
    const user = userEvent.setup();
    renderForm("hello");

    await submitName(user, "");

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(mockUpdateAccountName).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("same spacje → komunikat walidacji, komenda niewołana", async () => {
    const user = userEvent.setup();
    renderForm("hello");

    await submitName(user, "   ");

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(mockUpdateAccountName).not.toHaveBeenCalled();
  });

  it("101 znaków → komunikat walidacji, komenda niewołana", async () => {
    const user = userEvent.setup();
    renderForm("a".repeat(101));

    await user.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(mockUpdateAccountName).not.toHaveBeenCalled();
  });

  it("na start pole nie jest oznaczone jako niepoprawne", () => {
    renderForm("hello");

    expect(nameInput()).toHaveAttribute("aria-invalid", "false");
  });

  it("po wysłaniu pustego pola jest oznaczone jako niepoprawne", async () => {
    const user = userEvent.setup();
    renderForm("hello");

    await submitName(user, "");

    await screen.findByText(INVALID);
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("po wysłaniu samych spacji pole jest oznaczone jako niepoprawne", async () => {
    const user = userEvent.setup();
    renderForm("hello");

    await submitName(user, "   ");

    await screen.findByText(INVALID);
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("po udanym wysłaniu pole nie jest oznaczone jako niepoprawne", async () => {
    const user = userEvent.setup();
    renderForm("hello");

    await submitName(user, "Jan Kowalski");

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(nameInput()).toHaveAttribute("aria-invalid", "false");
  });

  it("przed wysłaniem nie pokazuje komunikatu walidacji", () => {
    renderForm("hello");

    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });
});
