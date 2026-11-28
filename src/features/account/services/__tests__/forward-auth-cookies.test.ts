import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCookieStore, mockCookies } = vi.hoisted(() => {
  const store = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
  return { mockCookieStore: store, mockCookies: vi.fn(async () => store) };
});

vi.mock("next/headers", () => ({ cookies: mockCookies }));

import { forwardAuthCookies } from "../forward-auth-cookies";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("forwardAuthCookies", () => {
  it("przenosi ciasteczko sesji z nazwą, wartością i atrybutami", async () => {
    await forwardAuthCookies(
      new Headers({
        "set-cookie":
          "better-auth.session_data=abc; Path=/; Max-Age=300; HttpOnly; SameSite=Lax",
      }),
    );

    expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "better-auth.session_data",
      "abc",
      expect.objectContaining({
        path: "/",
        maxAge: 300,
        httpOnly: true,
        sameSite: "lax",
      }),
    );
  });

  it("dwa ciasteczka w jednej wartości set-cookie → dwa zapisy", async () => {
    await forwardAuthCookies(
      new Headers({ "set-cookie": "a=1; Path=/, b=2; Path=/" }),
    );

    expect(mockCookieStore.set).toHaveBeenCalledTimes(2);
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "a",
      "1",
      expect.objectContaining({ path: "/" }),
    );
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "b",
      "2",
      expect.objectContaining({ path: "/" }),
    );
  });

  it("dwa osobne nagłówki set-cookie → oba ciasteczka zapisane", async () => {
    const headers = new Headers();
    headers.append(
      "set-cookie",
      "better-auth.session_token=tok; Path=/; HttpOnly; SameSite=Lax",
    );
    headers.append(
      "set-cookie",
      "better-auth.session_data=abc; Path=/; Max-Age=300; HttpOnly; SameSite=Lax",
    );

    await forwardAuthCookies(headers);

    expect(mockCookieStore.set).toHaveBeenCalledTimes(2);
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "better-auth.session_token",
      "tok",
      expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax" }),
    );
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "better-auth.session_data",
      "abc",
      expect.objectContaining({ path: "/", maxAge: 300, httpOnly: true }),
    );
  });

  it("ciasteczko bez atrybutów nie dostaje httpOnly ani maxAge", async () => {
    await forwardAuthCookies(new Headers({ "set-cookie": "a=1; Path=/" }));

    const options = mockCookieStore.set.mock.calls[0][2];
    expect(options.httpOnly).toBeFalsy();
    expect(options.maxAge).toBeUndefined();
  });

  it("brak nagłówka set-cookie → żadnego zapisu ciasteczek", async () => {
    await forwardAuthCookies(
      new Headers({ "content-type": "application/json" }),
    );

    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("puste nagłówki → żadnego zapisu ciasteczek", async () => {
    await forwardAuthCookies(new Headers());

    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });
});
