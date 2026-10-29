import { z } from "zod";
import { knownApiScopes } from "../services/api-scopes";

export const API_KEY_EXPIRY_DAYS = [30, 90, 365] as const;

export function createApiKeySchema() {
  const known = knownApiScopes();
  return z.object({
    name: z.string().trim().min(1).max(100),
    scopes: z.array(z.string().refine((scope) => known.includes(scope))).min(1),
    expiresInDays: z.union([
      z.literal(30),
      z.literal(90),
      z.literal(365),
      z.null(),
    ]),
  });
}

export const apiKeyIdSchema = z.object({ id: z.uuid() });
