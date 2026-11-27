import { z } from "zod";
import { defineEvents } from "@/shared/lib/events";

export const events = defineEvents({
  "invoices.issued": z.object({ invoiceId: z.string() }),
});
