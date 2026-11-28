import { z } from "zod";

export const accountNameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type AccountNameValues = z.infer<typeof accountNameSchema>;
