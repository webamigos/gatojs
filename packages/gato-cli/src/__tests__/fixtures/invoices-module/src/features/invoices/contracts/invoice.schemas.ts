import { z } from "zod";

export const issueInvoiceSchema = z.object({ id: z.string().min(1) });
