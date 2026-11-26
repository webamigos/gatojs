import { NextResponse } from "next/server";
import { readUploadForDownload } from "@/features/uploads/services/read-upload";
import { isModuleEnabled } from "@/shared/lib/modules/require-module-enabled";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isModuleEnabled("uploads")) {
    return new NextResponse(null, { status: 404 });
  }
  const { id } = await params;
  const result = await readUploadForDownload(id);
  if (result.status === 404) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(Buffer.from(result.body), {
    status: 200,
    headers: result.headers,
  });
}
