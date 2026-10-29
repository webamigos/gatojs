import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import coreMessages from "@/app/messages/pl.json";
import apiKeysPl from "../../i18n/pl.json";
import type { ApiKeyRow } from "../../contracts/api-key.types";

const {
  mockCreate,
  mockRevoke,
  mockDelete,
  mockRefresh,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockRevoke: vi.fn(),
  mockDelete: vi.fn(),
  mockRefresh: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("../../services/commands/api-key-commands", () => ({
  createApiKeyCommand: mockCreate,
  revokeApiKeyCommand: mockRevoke,
  deleteApiKeyCommand: mockDelete,
}));
vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import { ServiceModeProvider } from "@/shared/components/service-mode/service-mode-provider";
import { ApiKeysManager } from "../api-keys-manager";

const messages = {
  ...coreMessages,
  "api-keys": {
    ...apiKeysPl,
    title: "Klucze API",
    empty: "Brak kluczy API.",
    create: "Nowy klucz",
    "form-name": "Nazwa",
    "form-scopes": "Zakresy",
    "form-expiry": "Wygaśnięcie",
    "expiry-30": "30 dni",
    "expiry-90": "90 dni",
    "expiry-365": "365 dni",
    "expiry-never": "Bez wygaśnięcia",
    submit: "Utwórz klucz",
    "secret-title": "Twój nowy klucz API",
    copy: "Kopiuj klucz",
    "secret-close": "Zamknij",
    "column-name": "Nazwa",
    "column-key": "Klucz",
    "column-scopes": "Zakresy",
    "column-last-used": "Ostatnie użycie",
    "column-status": "Status",
    "column-author": "Autor",
    "never-used": "Nigdy",
    "status-active": "Aktywny",
    "status-revoked": "Unieważniony",
    "status-expired": "Wygasły",
    revoke: "Unieważnij",
    delete: "Usuń",
    "revoke-confirm":
      "Unieważnić klucz „{name}”? Aplikacje używające go stracą dostęp.",
    "delete-confirm": "Usunąć klucz „{name}”? Tej operacji nie można cofnąć.",
  },
};

const SECRET = "wak_live_TAJNYKLUCZ1234567890abcdef";

function makeKey(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: "6f1c1e0e-5b7a-4a52-9a43-0d6a3a0f1111",
    name: "Integracja CRM",
    displayPrefix: "wak_live_ab12",
    scopes: ["organization:read"],
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    createdBy: { id: "u1", name: "Jan Kowalski" },
    ...overrides,
  };
}

function renderManager(keys: ApiKeyRow[] = [], serviceMode = false) {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <ServiceModeProvider
        active={serviceMode}
        organizationId="org-7"
        organizationName="Acme Sp. z o.o."
      >
        <ApiKeysManager keys={keys} />
      </ServiceModeProvider>
    </NextIntlClientProvider>,
  );
}

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest("tr");
  if (!row) {
    throw new Error(`Brak wiersza dla ${text}`);
  }
  return row;
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  expiry = "90 dni",
) {
  await user.click(screen.getByRole("button", { name: "Nowy klucz" }));
  const dialog = within(await screen.findByRole("dialog"));
  await user.type(dialog.getByLabelText("Nazwa"), "Integracja CRM");
  await user.click(
    dialog.getByRole("checkbox", { name: "Odczyt danych organizacji" }),
  );
  await user.click(dialog.getByRole("radio", { name: expiry }));
  return dialog;
}

async function findServiceModeDialog() {
  const heading = await screen.findByText("Tryb serwisowy");
  const dialog = heading.closest('[role="alertdialog"],[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("Brak okna potwierdzenia trybu serwisowego");
  }
  return within(dialog);
}

describe("ApiKeysManager", () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      success: true,
      data: { id: "new-1", plaintext: SECRET },
    });
    mockRevoke.mockResolvedValue({ success: true });
    mockDelete.mockResolvedValue({ success: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("pokazuje pusty stan bez tabeli", () => {
    renderManager();
    expect(screen.getByText("Brak kluczy API.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("wiersz listy pokazuje nazwę, prefiks z wielokropkiem, etykietę scope'a, autora i status", () => {
    renderManager([makeKey()]);
    const row = within(rowOf("Integracja CRM"));
    expect(row.getByText("wak_live_ab12…")).toBeInTheDocument();
    expect(row.getByText("Odczyt danych organizacji")).toBeInTheDocument();
    expect(row.getByText("Jan Kowalski")).toBeInTheDocument();
    expect(row.getByText("Aktywny")).toBeInTheDocument();
    expect(row.getByText("Nigdy")).toBeInTheDocument();
  });

  it("nagłówki kolumn listy", () => {
    renderManager([makeKey()]);
    for (const name of [
      "Nazwa",
      "Klucz",
      "Zakresy",
      "Ostatnie użycie",
      "Status",
      "Autor",
    ]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  it("klucz unieważniony ma status Unieważniony", () => {
    renderManager([makeKey({ revokedAt: new Date("2026-02-01T00:00:00Z") })]);
    expect(
      within(rowOf("Integracja CRM")).getByText("Unieważniony"),
    ).toBeInTheDocument();
  });

  it("klucz z datą wygaśnięcia w przeszłości ma status Wygasły", () => {
    renderManager([makeKey({ expiresAt: new Date("2020-01-01T00:00:00Z") })]);
    expect(
      within(rowOf("Integracja CRM")).getByText("Wygasły"),
    ).toBeInTheDocument();
  });

  it("klucz z datą wygaśnięcia w przyszłości jest Aktywny", () => {
    renderManager([makeKey({ expiresAt: new Date("2099-01-01T00:00:00Z") })]);
    expect(
      within(rowOf("Integracja CRM")).getByText("Aktywny"),
    ).toBeInTheDocument();
  });

  it("tworzenie wywołuje komendę z nazwą, scope'ami i dniami wygaśnięcia", async () => {
    const user = userEvent.setup();
    renderManager();
    const dialog = await fillForm(user, "30 dni");
    await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: "Integracja CRM",
        scopes: ["organization:read"],
        expiresInDays: 30,
      }),
    );
  });

  it("opcja Bez wygaśnięcia wysyła expiresInDays null", async () => {
    const user = userEvent.setup();
    renderManager();
    const dialog = await fillForm(user, "Bez wygaśnięcia");
    await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInDays: null }),
      ),
    );
  });

  it.each([
    ["90 dni", 90],
    ["365 dni", 365],
  ])("opcja %s wysyła expiresInDays %i", async (label, days) => {
    const user = userEvent.setup();
    renderManager();
    const dialog = await fillForm(user, label);
    await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInDays: days }),
      ),
    );
  });

  it("po sukcesie pokazuje pełny klucz i odświeża widok", async () => {
    const user = userEvent.setup();
    renderManager();
    const dialog = await fillForm(user);
    await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));

    expect(await screen.findByText(SECRET)).toBeInTheDocument();
    expect(screen.getByText("Twój nowy klucz API")).toBeInTheDocument();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("przycisk kopiowania zapisuje pełny klucz do schowka", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderManager();
    const dialog = await fillForm(user);
    await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));
    await screen.findByText(SECRET);

    await user.click(screen.getByRole("button", { name: "Kopiuj klucz" }));

    expect(writeText).toHaveBeenCalledWith(SECRET);
  });

  it("po zamknięciu dialogu klucz znika z DOM i nie ma go w liście", async () => {
    const user = userEvent.setup();
    renderManager([makeKey({ id: "new-1", displayPrefix: "wak_live_TAJN" })]);
    const dialog = await fillForm(user);
    await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));
    await screen.findByText(SECRET);

    await user.click(screen.getByRole("button", { name: "Zamknij" }));

    await waitFor(() =>
      expect(screen.queryByText(SECRET)).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("pełny klucz nie pojawia się w liście kluczy, tylko prefiks", () => {
    renderManager([makeKey({ displayPrefix: "wak_live_TAJN" })]);
    expect(document.body.textContent).not.toContain(SECRET);
    expect(screen.getByText("wak_live_TAJN…")).toBeInTheDocument();
  });

  it("błąd komendy tworzenia → toast z komunikatem, bez dialogu klucza", async () => {
    mockCreate.mockResolvedValue({
      success: false,
      error: "Osiągnięto limit 10 aktywnych kluczy",
    });
    const user = userEvent.setup();
    renderManager();
    const dialog = await fillForm(user);
    await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Osiągnięto limit 10 aktywnych kluczy",
      ),
    );
    expect(screen.queryByText("Twój nowy klucz API")).not.toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  describe("tryb serwisowy", () => {
    it("tworzenie nie woła komendy przed potwierdzeniem", async () => {
      const user = userEvent.setup();
      renderManager([], true);
      const dialog = await fillForm(user);
      await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));

      await findServiceModeDialog();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("potwierdzenie przekazuje komendzie potwierdzenie z organizationId", async () => {
      const user = userEvent.setup();
      renderManager([], true);
      const dialog = await fillForm(user);
      await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));
      const confirmation = await findServiceModeDialog();
      await user.click(confirmation.getByRole("button", { name: "Zmień" }));

      await waitFor(() =>
        expect(mockCreate).toHaveBeenCalledWith(
          {
            name: "Integracja CRM",
            scopes: ["organization:read"],
            expiresInDays: 90,
          },
          { serviceModeConfirmed: true, organizationId: "org-7" },
        ),
      );
    });

    it("anulowanie (run zwraca null) → bez toasta, bez dialogu klucza, formularz zostaje", async () => {
      const user = userEvent.setup();
      renderManager([], true);
      const dialog = await fillForm(user);
      await user.click(dialog.getByRole("button", { name: "Utwórz klucz" }));
      const confirmation = await findServiceModeDialog();
      await user.click(confirmation.getByRole("button", { name: "Anuluj" }));

      await waitFor(() =>
        expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument(),
      );
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(screen.queryByText("Twój nowy klucz API")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Nazwa")).toHaveValue("Integracja CRM");
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("anulowanie unieważnienia → komenda niewołana, bez toasta", async () => {
      const user = userEvent.setup();
      renderManager([makeKey()], true);
      await user.click(
        within(rowOf("Integracja CRM")).getByRole("button", {
          name: "Unieważnij",
        }),
      );
      const confirmation = await findServiceModeDialog();
      await user.click(confirmation.getByRole("button", { name: "Anuluj" }));

      await waitFor(() =>
        expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument(),
      );
      expect(mockRevoke).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("usuwanie przechodzi przez potwierdzenie trybu serwisowego", async () => {
      const user = userEvent.setup();
      renderManager([makeKey()], true);
      await user.click(
        within(rowOf("Integracja CRM")).getByRole("button", { name: "Usuń" }),
      );
      const confirmation = await findServiceModeDialog();
      expect(mockDelete).not.toHaveBeenCalled();
      await user.click(confirmation.getByRole("button", { name: "Zmień" }));

      await waitFor(() =>
        expect(mockDelete).toHaveBeenCalledWith(
          { id: "6f1c1e0e-5b7a-4a52-9a43-0d6a3a0f1111" },
          { serviceModeConfirmed: true, organizationId: "org-7" },
        ),
      );
    });
  });

  it("unieważnienie woła komendę z id klucza i odświeża widok", async () => {
    const user = userEvent.setup();
    renderManager([makeKey()]);
    await user.click(
      within(rowOf("Integracja CRM")).getByRole("button", {
        name: "Unieważnij",
      }),
    );

    await waitFor(() =>
      expect(mockRevoke).toHaveBeenCalledWith({
        id: "6f1c1e0e-5b7a-4a52-9a43-0d6a3a0f1111",
      }),
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("błąd unieważnienia → toast z komunikatem bez odświeżania", async () => {
    mockRevoke.mockResolvedValue({
      success: false,
      error: "Nie znaleziono klucza",
    });
    const user = userEvent.setup();
    renderManager([makeKey()]);
    await user.click(
      within(rowOf("Integracja CRM")).getByRole("button", {
        name: "Unieważnij",
      }),
    );

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Nie znaleziono klucza"),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("usunięcie woła komendę z id klucza i odświeża widok", async () => {
    const user = userEvent.setup();
    renderManager([makeKey()]);
    await user.click(
      within(rowOf("Integracja CRM")).getByRole("button", { name: "Usuń" }),
    );

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith({
        id: "6f1c1e0e-5b7a-4a52-9a43-0d6a3a0f1111",
      }),
    );
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("błąd usunięcia → toast z komunikatem", async () => {
    mockDelete.mockResolvedValue({
      success: false,
      error: "Nie udało się usunąć klucza",
    });
    const user = userEvent.setup();
    renderManager([makeKey()]);
    await user.click(
      within(rowOf("Integracja CRM")).getByRole("button", { name: "Usuń" }),
    );

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Nie udało się usunąć klucza",
      ),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  describe("potwierdzenie przed unieważnieniem i usunięciem", () => {
    const KEY_ID = "6f1c1e0e-5b7a-4a52-9a43-0d6a3a0f1111";

    it("Unieważnij pyta o potwierdzenie z nazwą klucza", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderManager([makeKey()]);
      await user.click(
        within(rowOf("Integracja CRM")).getByRole("button", {
          name: "Unieważnij",
        }),
      );

      expect(confirm).toHaveBeenCalledWith(
        "Unieważnić klucz „Integracja CRM”? Aplikacje używające go stracą dostęp.",
      );
    });

    it("odmowa potwierdzenia unieważnienia → komenda niewołana, bez toasta i odświeżenia", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();
      renderManager([makeKey()], true);
      await user.click(
        within(rowOf("Integracja CRM")).getByRole("button", {
          name: "Unieważnij",
        }),
      );

      expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument();
      expect(mockRevoke).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("zgoda na unieważnienie → komenda z id", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderManager([makeKey()]);
      await user.click(
        within(rowOf("Integracja CRM")).getByRole("button", {
          name: "Unieważnij",
        }),
      );

      await waitFor(() =>
        expect(mockRevoke).toHaveBeenCalledWith({ id: KEY_ID }),
      );
    });

    it("Usuń pyta o potwierdzenie z nazwą klucza", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderManager([makeKey()]);
      await user.click(
        within(rowOf("Integracja CRM")).getByRole("button", { name: "Usuń" }),
      );

      expect(confirm).toHaveBeenCalledWith(
        "Usunąć klucz „Integracja CRM”? Tej operacji nie można cofnąć.",
      );
    });

    it("odmowa potwierdzenia usunięcia → komenda niewołana, bez toasta i odświeżenia", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();
      renderManager([makeKey()], true);
      await user.click(
        within(rowOf("Integracja CRM")).getByRole("button", { name: "Usuń" }),
      );

      expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument();
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("zgoda na usunięcie → komenda z id", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderManager([makeKey()]);
      await user.click(
        within(rowOf("Integracja CRM")).getByRole("button", { name: "Usuń" }),
      );

      await waitFor(() =>
        expect(mockDelete).toHaveBeenCalledWith({ id: KEY_ID }),
      );
    });
  });
});
