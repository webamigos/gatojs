import { z } from "zod";

const PEPPER_MIN_LENGTH = 32;
const EXAMPLE_API_KEY_PEPPER = "dev-only-api-key-pepper-change-me-0123456789";

export const envSchema = z
  .object({
    API_KEY_PEPPER: z.string().min(PEPPER_MIN_LENGTH),
    NODE_ENV: z.string().optional(),
  })
  .refine(
    (value) =>
      value.NODE_ENV !== "production" ||
      value.API_KEY_PEPPER !== EXAMPLE_API_KEY_PEPPER,
    {
      path: ["API_KEY_PEPPER"],
      message: "w produkcji nie może być wartością z .env.example",
    },
  )
  .transform(({ API_KEY_PEPPER }) => ({ API_KEY_PEPPER }));
