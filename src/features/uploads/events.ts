import { z } from "zod";
import { defineEvents } from "@/shared/lib/events/define-events";

export const events = defineEvents({
  "uploads.deleted": z.object({ uploadId: z.string() }),
});
