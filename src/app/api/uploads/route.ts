import { NextResponse } from "next/server";
import { createUpload } from "@/features/uploads/services/commands/create-upload";
import { maxUploadBytes } from "@/features/uploads/services/upload-purposes";

export const runtime = "nodejs";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxUploadBytes() + MULTIPART_OVERHEAD_BYTES
  ) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { body, status } = await createUpload(formData);
  return NextResponse.json(body, { status });
}
