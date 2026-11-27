import { defineCommandHooks } from "@/shared/lib/commands/define-command";
import { prisma } from "@/shared/lib/prisma";
import { DomainError } from "@/shared/utils/error-handling";

export const commandHooks = defineCommandHooks({
  "uploads.delete": {
    id: "invoices.keep-issued-pdf",
    before: async ({ id }, context) => {
      const issued = await prisma.invoice.count({
        where: {
          organizationId: context.organizationId,
          pdfUploadId: String(id),
          status: "issued",
        },
      });
      if (issued > 0) {
        throw new DomainError("This file is attached to an issued invoice");
      }
    },
  },
});
