"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ServiceModeConfirmation } from "@/shared/lib/auth/service-mode";
import { useServiceMode } from "./service-mode-provider";

type ServiceModeAction<TInput, TResult> = (
  input: TInput,
  confirmation?: ServiceModeConfirmation,
) => Promise<TResult>;

export interface ServiceModeActionRunner {
  run<TInput, TResult>(
    action: ServiceModeAction<TInput, TResult>,
    input: TInput,
  ): Promise<TResult | null>;
  requestConfirmation(): Promise<ServiceModeConfirmation | undefined | null>;
  dialog: React.ReactNode;
}

export function useServiceModeAction(): ServiceModeActionRunner {
  const t = useTranslations("serviceMode");
  const { active, organizationId, organizationName } = useServiceMode();
  const [open, setOpen] = useState(false);
  const pendingDecision = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = pendingDecision.current;
    pendingDecision.current = null;
    setOpen(false);
    resolve?.(confirmed);
  }, []);

  const askForConfirmation = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        pendingDecision.current?.(false);
        pendingDecision.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const requestConfirmation = useCallback(async () => {
    if (!active) {
      return undefined;
    }
    const confirmed = await askForConfirmation();
    if (!confirmed) {
      return null;
    }
    return { serviceModeConfirmed: true as const, organizationId };
  }, [active, organizationId, askForConfirmation]);

  const run = useCallback(
    async <TInput, TResult>(
      action: ServiceModeAction<TInput, TResult>,
      input: TInput,
    ): Promise<TResult | null> => {
      const confirmation = await requestConfirmation();
      if (confirmation === null) {
        return null;
      }
      return confirmation ? action(input, confirmation) : action(input);
    },
    [requestConfirmation],
  );

  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          settle(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("dialog-title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("dialog-description", { name: organizationName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("dialog-cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>
            {t("dialog-confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { run, requestConfirmation, dialog };
}
