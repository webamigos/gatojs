import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModuleDisabledError } from "@/shared/lib/modules/module-disabled-error";

const {
  mockAuthApi,
  mockLogger,
  mockRequireModuleEnabled,
  mockForwardAuthCookies,
  REQUEST_HEADERS,
  RESPONSE_HEADERS,
} = vi.hoisted(() => ({
  mockAuthApi: {
    getSession: vi.fn(),
    updateUser: vi.fn(),
  },
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockRequireModuleEnabled: vi.fn(),
  mockForwardAuthCookies: vi.fn(),
  REQUEST_HEADERS: new Headers({ cookie: "session=abc" }),
  RESPONSE_HEADERS: new Headers({
    "set-cookie":
      "better-auth.session_data=fresh; Path=/; Max-Age=300; HttpOnly; SameSite=Lax",
  }),
}));

vi.mock("@/shared/lib/auth", () => ({ auth: { api: mockAuthApi } }));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(REQUEST_HEADERS),
}));
vi.mock(
  "@/shared/lib/modules/require-module-enabled",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/shared/lib/modules/require-module-enabled")
    >()),
    requireModuleEnabled: mockRequireModuleEnabled,
  }),
);

vi.mock("../../forward-auth-cookies", () => ({
  forwardAuthCookies: mockForwardAuthCookies,
}));

import { updateAccountNameCommand } from "../update-account-name-command";

const SESSION = { session: { id: "session-1" }, user: { id: "user-1" } };
const INVALID = "Podaj imię i nazwisko (od 1 do 100 znaków).";
const SESSION_EXPIRED = "Sesja wygasła. Zaloguj się ponownie.";
const SAVE_FAILED = "Nie udało się zapisać imienia i nazwiska.";

function updateUserArgument(): {
  body: unknown;
  headers: unknown;
  returnHeaders?: unknown;
} {
  expect(mockAuthApi.updateUser).toHaveBeenCalledTimes(1);
  return mockAuthApi.updateUser.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireModuleEnabled.mockImplementation(() => undefined);
  mockAuthApi.getSession.mockResolvedValue(SESSION);
  mockAuthApi.updateUser.mockResolvedValue({
    headers: RESPONSE_HEADERS,
    response: { status: true },
  });
  mockForwardAuthCookies.mockResolvedValue(undefined);
});

describe("updateAccountNameCommand", () => {
  it("zapisuje obcięte imię i nazwisko i zwraca je w danych wyniku", async () => {
    const result = await updateAccountNameCommand({
      name: "  Jan Kowalski  ",
    });

    expect(result).toEqual({ success: true, data: { name: "Jan Kowalski" } });
    expect(updateUserArgument().body).toEqual({ name: "Jan Kowalski" });
  });

  it("przekazuje nagłówki żądania do getSession i updateUser", async () => {
    await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(mockAuthApi.getSession).toHaveBeenCalledWith({
      headers: REQUEST_HEADERS,
    });
    expect(updateUserArgument().headers).toBe(REQUEST_HEADERS);
  });

  it("ciało updateUser zawiera wyłącznie name, nawet gdy wejście ma inne klucze", async () => {
    const result = await updateAccountNameCommand({
      name: "Jan",
      email: "x@y.z",
      role: "admin",
    });

    expect(updateUserArgument().body).toEqual({ name: "Jan" });
    expect(result).toEqual({ success: true, data: { name: "Jan" } });
  });

  it("przyjmuje imię i nazwisko o długości 100 znaków", async () => {
    const name = "a".repeat(100);

    const result = await updateAccountNameCommand({ name });

    expect(result).toEqual({ success: true, data: { name } });
    expect(updateUserArgument().body).toEqual({ name });
  });

  it("limit 100 znaków liczy się po obcięciu spacji", async () => {
    const name = "a".repeat(100);

    const result = await updateAccountNameCommand({ name: `  ${name}  ` });

    expect(result).toEqual({ success: true, data: { name } });
  });

  it("przyjmuje jednoznakowe imię", async () => {
    const result = await updateAccountNameCommand({ name: " J " });

    expect(result).toEqual({ success: true, data: { name: "J" } });
  });

  it.each([
    ["pusty napis", { name: "" }],
    ["same spacje", { name: "   " }],
    ["101 znaków", { name: "a".repeat(101) }],
    ["liczba zamiast napisu", { name: 5 }],
    ["brak pola name", {}],
    ["null", null],
    ["napis zamiast obiektu", "Jan"],
    ["undefined", undefined],
  ])(
    "niepoprawne wejście (%s) → błąd walidacji bez wywołania better-auth",
    async (_label, input) => {
      const result = await updateAccountNameCommand(input);

      expect(result).toEqual({ success: false, error: INVALID });
      expect(mockAuthApi.updateUser).not.toHaveBeenCalled();
      expect(mockAuthApi.getSession).not.toHaveBeenCalled();
      expect(mockForwardAuthCookies).not.toHaveBeenCalled();
    },
  );

  it("brak sesji → błąd wygasłej sesji bez zapisu", async () => {
    mockAuthApi.getSession.mockResolvedValue(null);

    const result = await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED });
    expect(mockAuthApi.updateUser).not.toHaveBeenCalled();
    expect(mockForwardAuthCookies).not.toHaveBeenCalled();
  });

  it("błąd updateUser → ogólny komunikat o nieudanym zapisie, bez sukcesu", async () => {
    mockAuthApi.updateUser.mockRejectedValue(new Error("db down"));

    const result = await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(result).toEqual({ success: false, error: SAVE_FAILED });
    expect(mockForwardAuthCookies).not.toHaveBeenCalled();
  });

  it("nieoczekiwany błąd updateUser jest logowany, a nie połykany", async () => {
    mockAuthApi.updateUser.mockRejectedValue(new Error("db down"));

    await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(mockLogger.error).toHaveBeenCalledWith(SAVE_FAILED, {
      err: expect.objectContaining({ message: "db down" }),
    });
  });

  it("błąd getSession → ogólny komunikat bez zapisu", async () => {
    mockAuthApi.getSession.mockRejectedValue(new Error("auth down"));

    const result = await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(result).toEqual({ success: false, error: SAVE_FAILED });
    expect(mockAuthApi.updateUser).not.toHaveBeenCalled();
    expect(mockForwardAuthCookies).not.toHaveBeenCalled();
  });

  it("sprawdza, czy moduł account jest włączony", async () => {
    await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(mockRequireModuleEnabled).toHaveBeenCalledWith("account");
  });

  it("sprawdzenie modułu następuje przed jakimkolwiek wywołaniem better-auth", async () => {
    await updateAccountNameCommand({ name: "Jan Kowalski" });

    const moduleCheckOrder =
      mockRequireModuleEnabled.mock.invocationCallOrder[0];
    expect(moduleCheckOrder).toBeLessThan(
      mockAuthApi.getSession.mock.invocationCallOrder[0],
    );
    expect(moduleCheckOrder).toBeLessThan(
      mockAuthApi.updateUser.mock.invocationCallOrder[0],
    );
  });

  it("wyłączony moduł account → ogólny komunikat, bez getSession i updateUser", async () => {
    mockRequireModuleEnabled.mockImplementation((key: string) => {
      throw new ModuleDisabledError(key);
    });

    const result = await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(result).toEqual({ success: false, error: SAVE_FAILED });
    expect(mockAuthApi.getSession).not.toHaveBeenCalled();
    expect(mockAuthApi.updateUser).not.toHaveBeenCalled();
    expect(mockForwardAuthCookies).not.toHaveBeenCalled();
  });

  it("wyłączony moduł ma pierwszeństwo przed walidacją wejścia", async () => {
    mockRequireModuleEnabled.mockImplementation((key: string) => {
      throw new ModuleDisabledError(key);
    });

    const result = await updateAccountNameCommand({ name: "" });

    expect(result).toEqual({ success: false, error: SAVE_FAILED });
  });

  it("wywołuje updateUser z returnHeaders: true", async () => {
    await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(updateUserArgument().returnHeaders).toBe(true);
    expect(mockAuthApi.updateUser).toHaveBeenCalledWith({
      body: { name: "Jan Kowalski" },
      headers: REQUEST_HEADERS,
      returnHeaders: true,
    });
  });

  it("przekazuje nagłówki odpowiedzi updateUser do forwardAuthCookies dokładnie raz", async () => {
    const result = await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(mockForwardAuthCookies).toHaveBeenCalledTimes(1);
    expect(mockForwardAuthCookies.mock.calls[0][0]).toBe(RESPONSE_HEADERS);
    expect(result).toEqual({ success: true, data: { name: "Jan Kowalski" } });
  });

  it("ciasteczka są przekazywane dopiero po updateUser", async () => {
    await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(mockAuthApi.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockForwardAuthCookies.mock.invocationCallOrder[0],
    );
  });

  it("forwardAuthCookies dostaje nagłówki odpowiedzi, nie nagłówki żądania", async () => {
    await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(mockForwardAuthCookies.mock.calls[0][0]).not.toBe(REQUEST_HEADERS);
    expect(mockForwardAuthCookies.mock.calls[0][0].get("set-cookie")).toBe(
      "better-auth.session_data=fresh; Path=/; Max-Age=300; HttpOnly; SameSite=Lax",
    );
  });

  it("czeka na zapis ciasteczek przed zwróceniem sukcesu", async () => {
    let cookiesWritten = false;
    mockForwardAuthCookies.mockImplementation(async () => {
      await Promise.resolve();
      cookiesWritten = true;
    });

    await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(cookiesWritten).toBe(true);
  });

  it("błąd przekazania ciasteczek → ogólny komunikat o nieudanym zapisie", async () => {
    mockForwardAuthCookies.mockRejectedValue(
      new Error("cookies() poza żądaniem"),
    );

    const result = await updateAccountNameCommand({ name: "Jan Kowalski" });

    expect(result).toEqual({ success: false, error: SAVE_FAILED });
  });

  it("dwa kolejne wywołania zapisują każde własne imię", async () => {
    const first = await updateAccountNameCommand({ name: "Jan" });
    const second = await updateAccountNameCommand({ name: "Ewa" });

    expect(first).toEqual({ success: true, data: { name: "Jan" } });
    expect(second).toEqual({ success: true, data: { name: "Ewa" } });
    expect(mockAuthApi.updateUser).toHaveBeenCalledTimes(2);
    expect(mockAuthApi.updateUser.mock.calls[0][0].body).toEqual({
      name: "Jan",
    });
    expect(mockAuthApi.updateUser.mock.calls[1][0].body).toEqual({
      name: "Ewa",
    });
  });
});
