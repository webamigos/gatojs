import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { ModuleUploadPurpose } from "@/shared/lib/modules/define-module";

import { prepareUploadBody } from "../prepare-upload-body";

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

const editorImage: ModuleUploadPurpose = {
  key: "editor-image",
  mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024,
  visibility: "public",
  resizeImage: { maxWidth: 1200 },
};

describe("prepareUploadBody", () => {
  it("zmniejsza obraz 3000 px do 1200 px i zwraca jpg", async () => {
    const result = await prepareUploadBody(
      await makePng(3000),
      editorImage,
      "image/png",
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
      "image/png",
    );
    expect((await sharp(result.bytes).metadata()).width).toBe(800);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
  });

  it("zwraca bajty bez zmian dla celu bez resizeImage", async () => {
    const original = await makePng(3000);
    const { resizeImage: _omitted, ...withoutResize } = editorImage;
    const result = await prepareUploadBody(
      original,
      withoutResize,
      "image/png",
    );
    expect(result.bytes).toEqual(original);
    expect(result.mimeType).toBe("image/png");
    expect(result.extension).toBe("png");
  });
});
