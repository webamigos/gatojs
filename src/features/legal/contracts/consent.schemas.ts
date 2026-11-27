import { z } from "zod";

import { COOKIE_CATEGORIES, type CookieCategory } from "../legal-config";

const consentChoicesShape = Object.fromEntries(
  COOKIE_CATEGORIES.map((category) => [category, z.boolean().optional()]),
) as Record<CookieCategory, z.ZodOptional<z.ZodBoolean>>;

export const consentCookieSchema = z.object({
  v: z.number().int().min(1),
  c: z.object(consentChoicesShape),
  t: z.number().int().min(0),
});

export type ConsentCookiePayload = z.infer<typeof consentCookieSchema>;
