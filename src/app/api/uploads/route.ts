import { NextResponse } from "next/server";
import { createUpload } from "@/features/uploads/services/commands/create-upload";
import { localeFromHeaders } from "@/i18n/server-locale";
import { readOrgContextForApi } from "@/features/uploads/services/api-org-context";
import { maxUploadBytes } from "@/features/uploads/services/upload-purposes";

export const runtime = "nodejs";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    request.headers.get("content-length") === null ||
    !Number.isFinite(declaredLength)
  ) {
    return NextResponse.json({ error: "length_required" }, { status: 411 });
  }
  if (declaredLength > maxUploadBytes() + MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const access = await readOrgContextForApi();
  if (!access.ok) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: access.status },
    );
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { body, status } = await createUpload(
    formData,
    localeFromHeaders(request.headers),
  );
  return NextResponse.json(body, { status });
}
