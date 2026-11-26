"use server";

import { z } from "zod";
import { prisma } from "@/shared/lib/prisma";
import { auditActor, trackAudit } from "@/shared/lib/audit";
import { logger } from "@/shared/lib/logger";
import { can } from "@/shared/lib/auth/permissions";
import { defineCommand } from "@/shared/lib/commands/define-command";
import { runCommand } from "@/shared/lib/commands/run-command";
import { DomainError } from "@/shared/utils/error-handling";
import type { OperationResult } from "@/shared/types/common";
import { deleteObject } from "../storage";

const DELETE_FAILED = "Nie udało się usunąć pliku";
const NO_PERMISSION = "Brak uprawnień do usunięcia pliku";

const deleteUpload = defineCommand({
  key: "uploads.delete",
  module: "uploads",
  access: "member",
  input: z.object({ id: z.uuid() }),
  failureMessage: DELETE_FAILED,
  events: ["uploads.deleted"],
  run: async ({ id }, context, emit): Promise<OperationResult> => {
    const upload = await prisma.upload.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!upload) {
      return { success: false, error: DELETE_FAILED };
    }
    const allowed =
      upload.uploadedById === context.userId ||
      can(context, "uploads.delete-others");
    if (!allowed) {
      throw new DomainError(NO_PERMISSION);
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
    emit("uploads.deleted", { uploadId: upload.id });
    return { success: true };
  },
});

export async function deleteUploadCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult> {
  return runCommand(deleteUpload, input, confirmation);
}
