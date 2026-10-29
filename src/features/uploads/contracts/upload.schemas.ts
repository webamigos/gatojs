import { z } from "zod";

export const uploadFormSchema = z.object({
  file: z.instanceof(File),
  purpose: z.string().min(1),
});
