import { z } from "zod";
import { prisma } from "@/shared/lib/prisma";
import { readOrgContextForApi } from "./api-org-context";
import { contentDisposition } from "./content-disposition";
import { getObject } from "./storage";

const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";
const ORGANIZATION_CACHE_CONTROL = "private, max-age=300";

const uploadIdSchema = z.uuid();

export type ReadUploadResult =
  | { status: 200; body: Uint8Array; headers: Record<string, string> }
  | { status: 404 };

const NOT_FOUND: ReadUploadResult = { status: 404 };

async function canReadOrganizationFile(
  organizationId: string,
): Promise<boolean> {
  const access = await readOrgContextForApi();
  return access.ok && access.context.organizationId === organizationId;
}

export async function readUploadForDownload(
  id: string,
): Promise<ReadUploadResult> {
  if (!uploadIdSchema.safeParse(id).success) {
    return NOT_FOUND;
  }
  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) {
    return NOT_FOUND;
  }
  const isPublic = upload.visibility === "PUBLIC";
  if (!isPublic && !(await canReadOrganizationFile(upload.organizationId))) {
    return NOT_FOUND;
  }
  const stored = await getObject(upload.key);
  if (!stored) {
    return NOT_FOUND;
  }
  return {
    status: 200,
    body: stored.body,
    headers: {
      "Content-Type": upload.mimeType,
      "Content-Disposition": contentDisposition(upload.fileName, "inline"),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": isPublic
        ? PUBLIC_CACHE_CONTROL
        : ORGANIZATION_CACHE_CONTROL,
    },
  };
}
