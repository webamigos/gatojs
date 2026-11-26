import { z } from "zod";
import { defineEvents } from "@/shared/lib/events";

export const events = defineEvents({
  "notes.created": z.object({ noteId: z.string(), title: z.string() }),
});
