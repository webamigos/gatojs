import sharp from "sharp";
import type { ModuleUploadPurpose } from "@/shared/lib/modules/define-module";

const JPEG_QUALITY = 82;

export async function prepareUploadBody(
  bytes: Uint8Array,
  purpose: ModuleUploadPurpose,
  mimeType: string,
): Promise<{ bytes: Uint8Array; mimeType: string; extension: string }> {
  if (!purpose.resizeImage) {
    const extension = mimeType.split("/")[1] ?? "bin";
    return { bytes, mimeType, extension };
  }
  const resized = await sharp(bytes)
    .resize({ width: purpose.resizeImage.maxWidth, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return {
    bytes: new Uint8Array(resized),
    mimeType: "image/jpeg",
    extension: "jpg",
  };
}
