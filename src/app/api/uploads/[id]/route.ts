import { NextResponse } from "next/server";
import { readUploadForDownload } from "@/features/uploads/services/read-upload";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
