import { z } from "zod";

const MAX_FILE_NAME_LENGTH = 255;

export const uploadFormSchema = z.object({
  file: z
    .instanceof(File)
    .refine(
      (file) =>
        file.name.length >= 1 && file.name.length <= MAX_FILE_NAME_LENGTH,
    ),
  purpose: z.string().min(1),
});
