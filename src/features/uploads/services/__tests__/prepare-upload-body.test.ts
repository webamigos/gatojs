import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { ModuleUploadPurpose } from "@/shared/lib/modules/define-module";

import { InvalidImageError, prepareUploadBody } from "../prepare-upload-body";

async function makePng(width: number, height = 40) {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 10, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer(),
  );
}

const PNG = { mimeType: "image/png", extension: "png" };

const editorImageWithoutResize: ModuleUploadPurpose = {
  key: "editor-image",
  mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024,
  visibility: "public",
};

const editorImage: ModuleUploadPurpose = {
  ...editorImageWithoutResize,
  resizeImage: { maxWidth: 1200 },
};

describe("prepareUploadBody", () => {
  it("zmniejsza obraz 3000 px do 1200 px i zwraca jpg", async () => {
    const result = await prepareUploadBody(
      await makePng(3000),
      editorImage,
      PNG,
    );
    const meta = await sharp(result.bytes).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.format).toBe("jpeg");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
  });

  it("nie powiększa obrazu 800 px", async () => {
    const result = await prepareUploadBody(
      await makePng(800),
      editorImage,
      PNG,
    );
    expect((await sharp(result.bytes).metadata()).width).toBe(800);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
  });

  it("zwraca bajty bez zmian dla celu bez resizeImage", async () => {
    const original = new Uint8Array(
      await sharp({
        create: {
          width: 30,
          height: 20,
          channels: 3,
          background: { r: 9, g: 9, b: 9 },
        },
      })
        .webp()
        .toBuffer(),
    );
    const result = await prepareUploadBody(original, editorImageWithoutResize, {
      mimeType: "image/webp",
      extension: "webp",
    });
    expect(result.bytes).toEqual(original);
    expect(result.mimeType).toBe("image/webp");
    expect(result.extension).toBe("webp");
  });

  it("odrzuca obraz powyżej 40 000 000 pikseli", async () => {
    await expect(
      prepareUploadBody(await makePng(8000, 6000), editorImage, PNG),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("odrzuca uszkodzony obraz z poprawną sygnaturą PNG", async () => {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const broken = new Uint8Array([...signature, ...new Array(64).fill(7)]);
    await expect(
      prepareUploadBody(broken, editorImage, PNG),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("stosuje orientację EXIF i usuwa metadane orientacji", async () => {
    const rotated = new Uint8Array(
      await sharp({
        create: {
          width: 300,
          height: 100,
          channels: 3,
          background: { r: 1, g: 2, b: 3 },
        },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer(),
    );
    const result = await prepareUploadBody(rotated, editorImage, {
      mimeType: "image/jpeg",
      extension: "jpg",
    });
    const meta = await sharp(result.bytes).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(300);
    expect(meta.orientation).toBeUndefined();
  });

  it("spłaszcza przezroczyste tło PNG do białego piksela w rogu", async () => {
    const transparent = new Uint8Array(
      await sharp({
        create: {
          width: 20,
          height: 20,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer(),
    );

    const result = await prepareUploadBody(transparent, editorImage, PNG);

    const { data } = await sharp(result.bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
  });

  it("nie zmniejsza ani nie przetwarza typu innego niż obraz w celu z resizeImage", async () => {
    const pdf = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]);
    const purpose: ModuleUploadPurpose = {
      ...editorImage,
      mimeTypes: ["image/png", "application/pdf"],
    };

    const result = await prepareUploadBody(pdf, purpose, {
      mimeType: "application/pdf",
      extension: "pdf",
    });

    expect(result.bytes).toEqual(pdf);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.extension).toBe("pdf");
  });

  it("rzuca InvalidImageError z nazwą, komunikatem i oryginalnym błędem sharp w cause", async () => {
    const truncated = (await makePng(400, 400)).slice(0, 70);

    const thrown = await prepareUploadBody(truncated, editorImage, PNG).then(
      () => null,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(InvalidImageError);
    const error = thrown as InvalidImageError;
    expect(error.name).toBe("InvalidImageError");
    expect(error.message).toBe("Invalid image");
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toBe("vipspng: libpng read error");
    expect(error.cause).not.toBe(error);
  });
});
