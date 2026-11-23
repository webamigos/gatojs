"use server";

import { z } from "zod";
import { prisma } from "@/shared/lib/prisma";
import { auditActor, trackAudit } from "@/shared/lib/audit";
import { logger } from "@/shared/lib/logger";
import { getOrgContext } from "@/shared/lib/auth/org-context";
import { assertServiceModeConfirmed } from "@/shared/lib/auth/service-mode";
import { isGlobalAdmin, ORG_ROLES } from "@/shared/lib/auth/roles";
import {
  DomainError,
  handleCommandError,
  translatedFailure,
} from "@/shared/utils/error-handling";
import type { OperationResult } from "@/shared/types/common";
import { deleteObject } from "../storage";

const MODULE_NAMESPACE = "uploads";
const DELETE_FAILED = {
  key: "errors.deleteFailed",
  namespace: MODULE_NAMESPACE,
};
const NO_PERMISSION = {
  key: "errors.noDeletePermission",
  namespace: MODULE_NAMESPACE,
};

const deleteUploadSchema = z.object({ id: z.uuid() });

export async function deleteUploadCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult> {
  try {
    const context = await getOrgContext();
    assertServiceModeConfirmed(context, confirmation);
    const parsed = deleteUploadSchema.safeParse(input);
    if (!parsed.success) {
      return translatedFailure(DELETE_FAILED);
    }
    const upload = await prisma.upload.findFirst({
      where: { id: parsed.data.id, organizationId: context.organizationId },
    });
    if (!upload) {
      return translatedFailure(DELETE_FAILED);
    }
    const allowed =
      upload.uploadedById === context.userId ||
      context.orgRole === ORG_ROLES.OWNER ||
      context.orgRole === ORG_ROLES.ADMIN ||
      isGlobalAdmin(context.userRole);
    if (!allowed) {
      throw new DomainError("No permission to delete the file", NO_PERMISSION);
    }
    await deleteObject(upload.key).catch((error: unknown) => {
      logger.error("upload deleteObject failed", {
        err: error,
        key: upload.key,
      });
    });
    await prisma.upload.deleteMany({
      where: { id: upload.id, organizationId: context.organizationId },
    });
    await trackAudit({
      ...auditActor(context),
      action: "upload.deleted",
      entityType: "upload",
      entityId: upload.id,
      oldData: { purpose: upload.purpose, key: upload.key, size: upload.size },
    });
    return { success: true };
  } catch (error) {
    return handleCommandError(error, DELETE_FAILED);
  }
}
