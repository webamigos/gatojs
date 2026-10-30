import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import type { ModuleUploadPurpose } from "@/shared/lib/modules/define-module";

import { validateUpload } from "../validate-upload";

async function makePng(width: number, height = 10) {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 10, b: 10 },
      },
    })
      .png()
      .toBuffer(),
  );
}

function purpose(
  overrides: Partial<ModuleUploadPurpose> = {},
): ModuleUploadPurpose {
  return {
    key: "editor-image",
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
    visibility: "public",
    ...overrides,
  };
}

const text = (value: string) => new TextEncoder().encode(value);

describe("validateUpload", () => {
  let png: Uint8Array;

  beforeAll(async () => {
    png = await makePng(20);
  });

  it("wykrywa typ po bajtach, ignorując nazwę i typ klienta", async () => {
    const file = new File([png as BlobPart], "x.pdf", { type: "image/gif" });
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(await validateUpload(bytes, purpose())).toEqual({
      ok: true,
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("odrzuca SVG jako 415 unsupported_type", async () => {
    expect(
      await validateUpload(
        text(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
        purpose(),
      ),
    ).toEqual({ ok: false, status: 415, error: "unsupported_type" });
  });

  it("odrzuca SVG nawet gdy cel nielegalnie go dopuszcza", async () => {
    expect(
      await validateUpload(
        text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        purpose({ mimeTypes: ["image/svg+xml"] }),
      ),
    ).toEqual({ ok: false, status: 415, error: "unsupported_type" });
  });

  it("odrzuca HTML nawet gdy cel nielegalnie go dopuszcza", async () => {
    expect(
      await validateUpload(
        text("<!doctype html><html><body>x</body></html>"),
        purpose({ mimeTypes: ["text/html"] }),
      ),
    ).toEqual({ ok: false, status: 415, error: "unsupported_type" });
  });

  it("odrzuca HTML jako obraz", async () => {
    expect(
      await validateUpload(text("<html><script>1</script></html>"), purpose()),
    ).toEqual({ ok: false, status: 415, error: "unsupported_type" });
  });

  it("odrzuca PDF dla editor-image jako 415", async () => {
    expect(
      await validateUpload(
        text("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"),
        purpose(),
      ),
    ).toEqual({ ok: false, status: 415, error: "unsupported_type" });
  });

  it("odrzuca rozpoznany typ spoza listy celu", async () => {
    expect(
      await validateUpload(png, purpose({ mimeTypes: ["image/jpeg"] })),
    ).toEqual({ ok: false, status: 415, error: "unsupported_type" });
  });

  it("odrzuca pusty plik jako 400 empty", async () => {
    expect(await validateUpload(new Uint8Array(0), purpose())).toEqual({
      ok: false,
      status: 400,
      error: "empty",
    });
  });

  it("odrzuca maxBytes + 1 jako 413 too_large", async () => {
    expect(
      await validateUpload(png, purpose({ maxBytes: png.length - 1 })),
    ).toEqual({ ok: false, status: 413, error: "too_large" });
  });

  it("przyjmuje plik o rozmiarze dokładnie maxBytes", async () => {
    expect(
      await validateUpload(png, purpose({ maxBytes: png.length })),
    ).toEqual({ ok: true, mimeType: "image/png", extension: "png" });
  });

  it("zwraca 413 dla zbyt dużego pliku nierozpoznanego typu", async () => {
    expect(
      await validateUpload(
        new Uint8Array(200).fill(7),
        purpose({ maxBytes: 100 }),
      ),
    ).toEqual({ ok: false, status: 413, error: "too_large" });
  });
});
