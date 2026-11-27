"use server";

import { auditActor, trackAudit } from "@/shared/lib/audit";
import { defineCommand } from "@/shared/lib/commands/define-command";
import { runCommand } from "@/shared/lib/commands/run-command";
import { prisma } from "@/shared/lib/prisma";
import type { OperationResult } from "@/shared/types/common";
import { issueInvoiceSchema } from "../../contracts/invoice.schemas";

const issueInvoice = defineCommand({
  key: "invoices.issue",
  module: "invoices",
  access: "module",
  input: issueInvoiceSchema,
  failureMessage: "Could not issue the invoice",
  events: ["invoices.issued"],
  run: async (
    { id },
    context,
    emit,
  ): Promise<OperationResult<{ id: string }>> => {
    const updated = await prisma.invoice.updateMany({
      where: { id, organizationId: context.organizationId, status: "draft" },
      data: { status: "issued" },
    });
    if (updated.count === 0) {
      return { success: false, error: "Invoice not found or already issued" };
    }
    await trackAudit({
      ...auditActor(context),
      action: "invoice.issued",
      entityType: "invoice",
      entityId: id,
    });
    emit("invoices.issued", { invoiceId: id });
    return { success: true, data: { id } };
  },
});

export async function issueInvoiceCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult<{ id: string }>> {
  return runCommand(issueInvoice, input, confirmation);
}
