import { fileTypeFromBuffer } from "file-type";
import type { ModuleUploadPurpose } from "@/shared/lib/modules/define-module";
import { FORBIDDEN_MIME_TYPES } from "./upload-purposes";

export type UploadValidation =
  | { ok: true; mimeType: string; extension: string }
  | {
      ok: false;
      status: 400 | 413 | 415;
      error: "empty" | "too_large" | "unsupported_type";
    };

export async function validateUpload(
  bytes: Uint8Array,
  purpose: ModuleUploadPurpose,
): Promise<UploadValidation> {
  if (bytes.length === 0) {
    return { ok: false, status: 400, error: "empty" };
  }
  if (bytes.length > purpose.maxBytes) {
    return { ok: false, status: 413, error: "too_large" };
  }
  const detected = await fileTypeFromBuffer(
    new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  );
  if (
    !detected ||
    FORBIDDEN_MIME_TYPES.includes(detected.mime) ||
    !purpose.mimeTypes.includes(detected.mime)
  ) {
    return { ok: false, status: 415, error: "unsupported_type" };
  }
  return { ok: true, mimeType: detected.mime, extension: detected.ext };
}
