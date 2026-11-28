"use server";

import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireModuleEnabled } from "@/shared/lib/modules/require-module-enabled";
import type { OperationResult } from "@/shared/types/common";
import { handleCommandError } from "@/shared/utils/error-handling";
import { accountNameSchema } from "../../contracts/account.schemas";

export async function updateAccountNameCommand(
  input: unknown,
): Promise<OperationResult<{ name: string }>> {
  try {
    requireModuleEnabled("account");

    const parsed = accountNameSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Podaj imię i nazwisko (od 1 do 100 znaków).",
      };
    }

    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) {
      return { success: false, error: "Sesja wygasła. Zaloguj się ponownie." };
    }

    const { name } = parsed.data;
    await auth.api.updateUser({ body: { name }, headers: requestHeaders });

    return { success: true, data: { name } };
  } catch (error) {
    return handleCommandError(
      error,
      "Nie udało się zapisać imienia i nazwiska.",
    );
  }
}
