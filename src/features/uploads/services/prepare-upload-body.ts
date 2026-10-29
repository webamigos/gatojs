import sharp from "sharp";
import type { ModuleUploadPurpose } from "@/shared/lib/modules/define-module";

const JPEG_QUALITY = 82;
const MAX_INPUT_PIXELS = 40_000_000;

export class InvalidImageError extends Error {
  constructor(options?: ErrorOptions) {
    super("Invalid image", options);
    this.name = "InvalidImageError";
  }
}

export interface DetectedUploadType {
  mimeType: string;
  extension: string;
}

export async function prepareUploadBody(
  bytes: Uint8Array,
  purpose: ModuleUploadPurpose,
  detected: DetectedUploadType,
): Promise<{ bytes: Uint8Array; mimeType: string; extension: string }> {
  if (!purpose.resizeImage) {
    return { bytes, ...detected };
  }
  try {
    const resized = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: purpose.resizeImage.maxWidth, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return {
      bytes: new Uint8Array(resized),
      mimeType: "image/jpeg",
      extension: "jpg",
    };
  } catch (error) {
    throw new InvalidImageError({ cause: error });
  }
}
