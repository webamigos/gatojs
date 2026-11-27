import { z } from "zod";
import { defineEvents } from "@/shared/lib/events/define-events";

export const events = defineEvents({
  "api-keys.created": z.object({
    apiKeyId: z.string(),
    name: z.string(),
    scopes: z.array(z.string()),
  }),
  "api-keys.revoked": z.object({ apiKeyId: z.string() }),
  "api-keys.deleted": z.object({ apiKeyId: z.string() }),
});
