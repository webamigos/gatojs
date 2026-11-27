import { getOrgContext } from "@/shared/lib/auth/org-context";
import { prisma } from "@/shared/lib/prisma";

export async function listUnpaidInvoicesQuery(): Promise<
  { id: string; number: string }[]
> {
  const { organizationId } = await getOrgContext();
  return prisma.invoice.findMany({
    where: { organizationId, status: "issued" },
    select: { id: true, number: true },
    orderBy: { number: "asc" },
  });
}
