import { defineSubscribers } from "@/shared/lib/events";
import { prisma } from "@/shared/lib/prisma";

export const subscribers = defineSubscribers({
  "organizations.member-removed": {
    id: "invoices.unassign-removed-member",
    run: async (event) => {
      await prisma.invoice.updateMany({
        where: {
          organizationId: event.organizationId,
          assigneeId: event.payload.userId,
        },
        data: { assigneeId: null },
      });
    },
  },
});
