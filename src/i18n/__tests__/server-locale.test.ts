// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fc, test } from "@fast-check/vitest";

const { mockGetLocale } = vi.hoisted(() => ({ mockGetLocale: vi.fn() }));

vi.mock("next-intl/server", () => ({ getLocale: () => mockGetLocale() }));

import { currentLocale, localeFromHeaders } from "../server-locale";

describe("localeFromHeaders", () => {
  it("cookie NEXT_LOCALE=en → en", () => {
    expect(localeFromHeaders(new Headers({ cookie: "NEXT_LOCALE=en" }))).toBe(
      "en",
    );
  });

  it("cookie NEXT_LOCALE=pl → pl", () => {
    expect(localeFromHeaders(new Headers({ cookie: "NEXT_LOCALE=pl" }))).toBe(
      "pl",
    );
  });

  it("cookie NEXT_LOCALE=en wśród innych cookies → en", () => {
    expect(
      localeFromHeaders(
        new Headers({ cookie: "session=abc; NEXT_LOCALE=en; theme=dark" }),
      ),
    ).toBe("en");
  });

  it("nieobsługiwane cookie NEXT_LOCALE=de i Referer /en/... → en z Referer", () => {
    expect(
      localeFromHeaders(
        new Headers({
          cookie: "NEXT_LOCALE=de",
          referer: "https://app.test/en/users",
        }),
      ),
    ).toBe("en");
  });

  it("nieobsługiwane cookie NEXT_LOCALE=de bez Referer → pl, nie de", () => {
    expect(localeFromHeaders(new Headers({ cookie: "NEXT_LOCALE=de" }))).toBe(
      "pl",
    );
  });

  it("bez cookie, Referer https://x/en/sign-in → en", () => {
    expect(
      localeFromHeaders(new Headers({ referer: "https://x/en/sign-in" })),
    ).toBe("en");
  });

  it("bez cookie, Referer bez prefiksu języka → pl", () => {
    expect(
      localeFromHeaders(new Headers({ referer: "https://app.test/users" })),
    ).toBe("pl");
  });

  it("Referer z nieobsługiwanym językiem w pierwszym segmencie → pl, nie de", () => {
    expect(
      localeFromHeaders(new Headers({ referer: "https://app.test/de/users" })),
    ).toBe("pl");
  });

  it("Referer z en dopiero w drugim segmencie → pl", () => {
    expect(
      localeFromHeaders(new Headers({ referer: "https://app.test/users/en" })),
    ).toBe("pl");
  });

  it("niepoprawny Referer → pl bez wyjątku", () => {
    expect(localeFromHeaders(new Headers({ referer: "not a url" }))).toBe("pl");
  });

  it("undefined → pl", () => {
    expect(localeFromHeaders(undefined)).toBe("pl");
  });

  it("null → pl", () => {
    expect(localeFromHeaders(null)).toBe("pl");
  });

  it("puste nagłówki → pl", () => {
    expect(localeFromHeaders(new Headers())).toBe("pl");
  });

  it("cookie pl wygrywa z Referer /en/...", () => {
    expect(
      localeFromHeaders(
        new Headers({
          cookie: "NEXT_LOCALE=pl",
          referer: "https://app.test/en/users",
        }),
      ),
    ).toBe("pl");
  });

  it("cookie en wygrywa z Referer bez prefiksu języka", () => {
    expect(
      localeFromHeaders(
        new Headers({
          cookie: "NEXT_LOCALE=en",
          referer: "https://app.test/users",
        }),
      ),
    ).toBe("en");
  });

  test.prop([
    fc.stringMatching(/^[\x20-\x7e]*$/),
    fc.stringMatching(/^[\x20-\x7e]*$/),
  ])(
    "dla dowolnej wartości cookie i Referer zwraca obsługiwany język",
    (cookieValue, referer) => {
      const headers = new Headers({
        cookie: `NEXT_LOCALE=${cookieValue}`,
        referer,
      });
      expect(["pl", "en"]).toContain(localeFromHeaders(headers));
    },
  );

  test.prop([fc.constantFrom("pl", "en"), fc.webUrl()])(
    "obsługiwane cookie zawsze wygrywa z Referer",
    (locale, referer) => {
      const headers = new Headers({ cookie: `NEXT_LOCALE=${locale}`, referer });
      expect(localeFromHeaders(headers)).toBe(locale);
    },
  );
});

describe("currentLocale", () => {
  beforeEach(() => {
    mockGetLocale.mockReset();
  });

  it("getLocale zwraca en → en", async () => {
    mockGetLocale.mockResolvedValue("en");

    await expect(currentLocale()).resolves.toBe("en");
  });

  it("getLocale zwraca pl → pl", async () => {
    mockGetLocale.mockResolvedValue("pl");

    await expect(currentLocale()).resolves.toBe("pl");
  });

  it("getLocale zwraca nieobsługiwany de → pl", async () => {
    mockGetLocale.mockResolvedValue("de");

    await expect(currentLocale()).resolves.toBe("pl");
  });

  it("getLocale odrzuca obietnicę → pl", async () => {
    mockGetLocale.mockRejectedValue(new Error("no request context"));

    await expect(currentLocale()).resolves.toBe("pl");
  });

  it("getLocale rzuca synchronicznie → pl", async () => {
    mockGetLocale.mockImplementation(() => {
      throw new Error("`getLocale` is not supported in Client Components.");
    });

    await expect(currentLocale()).resolves.toBe("pl");
  });
});
