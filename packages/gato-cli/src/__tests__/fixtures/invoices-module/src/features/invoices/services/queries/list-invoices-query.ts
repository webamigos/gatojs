import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { prisma } from "@/shared/lib/prisma";
import type { InvoiceRow } from "../../contracts/invoice.types";

export async function listInvoicesQuery(): Promise<InvoiceRow[]> {
  const { organizationId } = await requireModuleAccess("invoices");
  return prisma.invoice.findMany({
    where: { organizationId },
    select: { id: true, number: true, status: true },
    orderBy: { number: "asc" },
  });
}
