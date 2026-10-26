import type { OperationResult } from "@/shared/types/common";

type BetterAuthResult<T = unknown> =
  | { data: T; error: null }
  | {
      data: null;
      error: { message?: string; status: number; statusText: string };
    };

export const AUTH_SUCCESS: BetterAuthResult<{ user: { id: string } }> = {
  error: null,
  data: { user: { id: "user-1" } },
};
export const AUTH_ERROR: BetterAuthResult = {
  error: { message: "error", status: 400, statusText: "Bad Request" },
  data: null,
};

export const CMD_SUCCESS: OperationResult = { success: true };
export const CMD_FAILURE: OperationResult = {
  success: false,
  error: "Błąd serwera",
};
