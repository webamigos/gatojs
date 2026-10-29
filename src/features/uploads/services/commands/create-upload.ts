import { randomUUID } from "node:crypto";
import { prisma } from "@/shared/lib/prisma";
import { auditActor, trackAudit } from "@/shared/lib/audit";
import { logger } from "@/shared/lib/logger";
import {
  assertServiceModeConfirmed,
  ServiceModeConfirmationError,
} from "@/shared/lib/auth/service-mode";
import { uploadFormSchema } from "../../contracts/upload.schemas";
import type { CreateUploadResult } from "../../contracts/upload.types";
import { readOrgContextForApi } from "../api-org-context";
import { InvalidImageError, prepareUploadBody } from "../prepare-upload-body";
import { deleteObject, putObject } from "../storage";
import { objectKey, resolveUploadPurpose } from "../upload-purposes";
import { validateUpload } from "../validate-upload";

function readConfirmation(formData: FormData): unknown {
  const raw = formData.get("serviceModeConfirmation");
  if (typeof raw !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function failure(
  status: 400 | 401 | 403 | 413 | 415 | 500,
  error: string,
): CreateUploadResult {
  return { status, body: { error } };
}

export async function createUpload(
  formData: FormData,
): Promise<CreateUploadResult> {
  const contextResult = await readOrgContextForApi();
  if (!contextResult.ok) {
    return failure(contextResult.status, "unauthorized");
  }
  const { context } = contextResult;
  try {
    assertServiceModeConfirmed(context, readConfirmation(formData));
  } catch (error) {
    if (error instanceof ServiceModeConfirmationError) {
      return failure(403, error.message);
    }
    throw error;
  }

  const parsed = uploadFormSchema.safeParse({
    file: formData.get("file"),
    purpose: formData.get("purpose"),
  });
  if (!parsed.success) {
    return failure(400, "invalid_input");
  }
  const purpose = resolveUploadPurpose(parsed.data.purpose);
  if (!purpose) {
    return failure(400, "unknown_purpose");
  }

  const original = new Uint8Array(await parsed.data.file.arrayBuffer());
  const validation = await validateUpload(original, purpose);
  if (!validation.ok) {
    return failure(validation.status, validation.error);
  }

  let prepared: Awaited<ReturnType<typeof prepareUploadBody>>;
  try {
    prepared = await prepareUploadBody(original, purpose, validation);
  } catch (error) {
    if (error instanceof InvalidImageError) {
      return failure(400, "invalid_image");
    }
    throw error;
  }

  const id = randomUUID();
  const key = objectKey({
    organizationId: context.organizationId,
    purpose: purpose.key,
    id,
    extension: prepared.extension,
  });
  try {
    await putObject(key, prepared.bytes, prepared.mimeType);
  } catch (error) {
    logger.error("upload putObject failed", { err: error });
    return failure(500, "storage_failed");
  }

  try {
    await prisma.upload.create({
      data: {
        id,
        organizationId: context.organizationId,
        uploadedById: context.userId,
        purpose: purpose.key,
        key,
        fileName: parsed.data.file.name,
        mimeType: prepared.mimeType,
        size: prepared.bytes.length,
        visibility: purpose.visibility === "public" ? "PUBLIC" : "ORGANIZATION",
      },
    });
  } catch (error) {
    logger.error("upload record create failed", { err: error });
    await deleteObject(key).catch((cleanupError: unknown) => {
      logger.error("upload rollback failed", { err: cleanupError, key });
    });
    return failure(500, "storage_failed");
  }

  await trackAudit({
    ...auditActor(context),
    action: "upload.created",
    entityType: "upload",
    entityId: id,
    newData: { purpose: purpose.key, key, size: prepared.bytes.length },
  });

  return {
    status: 201,
    body: {
      id,
      url: `/api/uploads/${id}`,
      fileName: parsed.data.file.name,
      mimeType: prepared.mimeType,
      size: prepared.bytes.length,
    },
  };
}
