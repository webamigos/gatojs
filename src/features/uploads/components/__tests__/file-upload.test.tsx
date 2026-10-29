import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import plAppMessages from "@/app/messages/pl.json";
import plUploadsMessages from "@/features/uploads/i18n/pl.json";
import { ServiceModeProvider } from "@/shared/components/service-mode/service-mode-provider";
import type { UploadResponse } from "../../contracts/upload.types";
import { FileUpload } from "../file-upload";

const fetchMock = vi.fn<typeof fetch>();
const onUploaded = vi.fn<(upload: UploadResponse) => void>();

const CREATED: UploadResponse = {
  id: "upl-1",
  url: "/api/uploads/upl-1",
  fileName: "logo.png",
  mimeType: "image/png",
  size: 4,
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pngFile() {
  return new File([new Uint8Array([1, 2, 3, 4])], "logo.png", {
    type: "image/png",
  });
}

function renderUpload({
  active = false,
  accept,
}: {
  active?: boolean;
  accept?: string;
} = {}) {
  return render(
    <NextIntlClientProvider
      locale="pl"
      messages={{ ...plAppMessages, uploads: plUploadsMessages }}
    >
      <ServiceModeProvider
        active={active}
        organizationId="org-7"
        organizationName="Acme Sp. z o.o."
      >
        <FileUpload purpose="avatar" accept={accept} onUploaded={onUploaded} />
      </ServiceModeProvider>
    </NextIntlClientProvider>,
  );
}

function fileInput(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Brak pola pliku");
  }
  return input;
}

function sentBody() {
  const body = fetchMock.mock.calls[0][1]?.body;
  if (!(body instanceof FormData)) {
    throw new Error("Żądanie nie niesie FormData");
  }
  return body;
}

async function findConfirmationDialog() {
  const heading = await screen.findByText("Tryb serwisowy");
  const dialog = heading.closest('[role="alertdialog"],[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("Brak okna potwierdzenia");
  }
  return within(dialog);
}

describe("FileUpload", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(201, CREATED));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("przekazuje atrybut accept do pola pliku", () => {
    const { container } = renderUpload({ accept: "image/png,image/jpeg" });

    expect(fileInput(container)).toHaveAttribute(
      "accept",
      "image/png,image/jpeg",
    );
  });

  it("wybór pliku wysyła POST /api/uploads z plikiem i purpose, bez potwierdzenia poza trybem serwisowym", async () => {
    const user = userEvent.setup();
    const { container } = renderUpload();

    await user.upload(fileInput(container), pngFile());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/uploads");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    const body = sentBody();
    const sentFile = body.get("file");
    expect(sentFile).toBeInstanceOf(File);
    expect((sentFile as File).name).toBe("logo.png");
    expect((sentFile as File).size).toBe(4);
    expect(body.get("purpose")).toBe("avatar");
    expect(body.has("serviceModeConfirmation")).toBe(false);
  });

  it("odpowiedź 201 woła onUploaded z odpowiedzią serwera i pokazuje podgląd obrazu", async () => {
    const user = userEvent.setup();
    const { container } = renderUpload();

    await user.upload(fileInput(container), pngFile());

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onUploaded).toHaveBeenCalledWith(CREATED);
    const preview = await screen.findByRole("img");
    expect(preview).toHaveAttribute("src", "/api/uploads/upl-1");
  });

  it("w trybie serwisowym nie wysyła żądania przed decyzją w oknie", async () => {
    const user = userEvent.setup();
    const { container } = renderUpload({ active: true });

    await user.upload(fileInput(container), pngFile());

    await findConfirmationDialog();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("w trybie serwisowym „Zmień” dołącza serviceModeConfirmation jako JSON aktywnej organizacji", async () => {
    const user = userEvent.setup();
    const { container } = renderUpload({ active: true });

    await user.upload(fileInput(container), pngFile());
    const dialog = await findConfirmationDialog();
    await user.click(dialog.getByRole("button", { name: "Zmień" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body.get("serviceModeConfirmation")).toBe(
      '{"serviceModeConfirmed":true,"organizationId":"org-7"}',
    );
    expect(body.get("purpose")).toBe("avatar");
    expect((body.get("file") as File).name).toBe("logo.png");
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(CREATED));
  });

  it("w trybie serwisowym „Anuluj” nie wysyła żądania i nie woła onUploaded", async () => {
    const user = userEvent.setup();
    const { container } = renderUpload({ active: true });

    await user.upload(fileInput(container), pngFile());
    const dialog = await findConfirmationDialog();
    await user.click(dialog.getByRole("button", { name: "Anuluj" }));

    await waitFor(() =>
      expect(screen.queryByText("Tryb serwisowy")).not.toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("odpowiedź 413 pokazuje komunikat o zbyt dużym pliku i nie woła onUploaded", async () => {
    fetchMock.mockResolvedValue(jsonResponse(413, { error: "too_large" }));
    const user = userEvent.setup();
    const { container } = renderUpload();

    await user.upload(fileInput(container), pngFile());

    expect(await screen.findByText("Plik jest za duży")).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("odpowiedź 415 pokazuje komunikat o nieobsługiwanym typie i nie woła onUploaded", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(415, { error: "unsupported_type" }),
    );
    const user = userEvent.setup();
    const { container } = renderUpload();

    await user.upload(fileInput(container), pngFile());

    expect(
      await screen.findByText("Nieobsługiwany typ pliku"),
    ).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByText("Plik jest za duży")).not.toBeInTheDocument();
  });

  it("odpowiedź 413 i 415 dają różne komunikaty", async () => {
    fetchMock.mockResolvedValue(jsonResponse(413, { error: "too_large" }));
    const user = userEvent.setup();
    const { container } = renderUpload();

    await user.upload(fileInput(container), pngFile());

    await screen.findByText("Plik jest za duży");
    expect(
      screen.queryByText("Nieobsługiwany typ pliku"),
    ).not.toBeInTheDocument();
  });

  it("odrzucony fetch (awaria sieci) nie woła onUploaded", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    const { container } = renderUpload();

    await user.upload(fileInput(container), pngFile());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("błąd 401 nie woła onUploaded i nie pokazuje podglądu", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    const user = userEvent.setup();
    const { container } = renderUpload();

    await user.upload(fileInput(container), pngFile());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("po błędzie kolejny udany wybór pliku woła onUploaded i czyści komunikat", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(413, { error: "too_large" }));
    const user = userEvent.setup();
    const { container } = renderUpload();

    await user.upload(fileInput(container), pngFile());
    await screen.findByText("Plik jest za duży");
    await user.upload(fileInput(container), pngFile());

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(CREATED));
    expect(screen.queryByText("Plik jest za duży")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
