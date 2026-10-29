import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contentDisposition } from "../content-disposition";

describe("contentDisposition", () => {
  it("składa nazwę ASCII w filename i filename*", () => {
    expect(contentDisposition("raport.pdf", "inline")).toBe(
      "inline; filename=\"raport.pdf\"; filename*=UTF-8''raport.pdf",
    );
  });

  it("używa podanego typu dyspozycji attachment", () => {
    expect(contentDisposition("raport.pdf", "attachment")).toBe(
      "attachment; filename=\"raport.pdf\"; filename*=UTF-8''raport.pdf",
    );
  });

  it("zastępuje znaki spoza ASCII i cudzysłów w filename, a filename* koduje procentowo", () => {
    expect(contentDisposition('zażółć "x".pdf', "inline")).toBe(
      "inline; filename=\"za____ _x_.pdf\"; filename*=UTF-8''za%C5%BC%C3%B3%C5%82%C4%87%20%22x%22.pdf",
    );
  });

  it("zastępuje nową linię i powrót karetki, więc nagłówek nie zawiera CR ani LF", () => {
    const header = contentDisposition("a\r\nb.pdf", "inline");

    expect(header).toBe(
      "inline; filename=\"a__b.pdf\"; filename*=UTF-8''a%0D%0Ab.pdf",
    );
    expect(header).not.toMatch(/[\r\n]/);
  });

  it("zastępuje średnik i ukośnik odwrotny w filename", () => {
    expect(contentDisposition("a;b\\c.pdf", "inline")).toBe(
      "inline; filename=\"a_b_c.pdf\"; filename*=UTF-8''a%3Bb%5Cc.pdf",
    );
  });

  it("zastępuje znak sterujący tabulacji w filename", () => {
    expect(contentDisposition("a\tb.txt", "inline")).toBe(
      "inline; filename=\"a_b.txt\"; filename*=UTF-8''a%09b.txt",
    );
  });

  it("koduje apostrof w filename*, bo jest ogranicznikiem składni RFC 5987", () => {
    expect(contentDisposition("o'k.txt", "inline")).toBe(
      "inline; filename=\"o'k.txt\"; filename*=UTF-8''o%27k.txt",
    );
  });

  test.prop(
    [
      fc.oneof(
        fc.string({ unit: "grapheme-ascii" }),
        fc.string({ unit: "grapheme" }),
      ),
      fc.constantFrom("inline" as const, "attachment" as const),
    ],
    { numRuns: 300 },
  )(
    "nagłówek jest jedną linią ASCII, filename bez znaków specjalnych, a filename* wraca do oryginału",
    (fileName, disposition) => {
      const header = contentDisposition(fileName, disposition);

      const match =
        /^(inline|attachment); filename="([^"]*)"; filename\*=UTF-8''(.*)$/.exec(
          header,
        );
      expect(match).not.toBeNull();
      expect(match![1]).toBe(disposition);
      expect(match![2]).toMatch(/^[ !#-:<-\[\]-~]*$/);
      expect(match![3]).toMatch(/^[A-Za-z0-9%._~!*()-]*$/);
      expect(decodeURIComponent(match![3]!)).toBe(fileName);
      expect(header).toMatch(/^[\x20-\x7e]*$/);
    },
  );
});
