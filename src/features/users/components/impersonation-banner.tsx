"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserCog } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { authClient } from "@/shared/lib/auth/client";
import { Button } from "@/components/ui/button";
import type { OperationResult } from "@/shared/types/common";

interface ImpersonationBannerProps {
  active: boolean;
  userName: string;
  onStopLogged: () => Promise<OperationResult>;
}

export function ImpersonationBanner({
  active,
  userName,
  onStopLogged,
}: ImpersonationBannerProps) {
  const t = useTranslations("users");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!active) {
    return null;
  }

  async function handleStop() {
    setPending(true);
    try {
      // WHY: the stop is recorded first because ending impersonation clears the session's impersonatedBy marker.
      const auditResult = await onStopLogged();
      if (!auditResult.success) {
        // eslint-disable-next-line no-console -- client components have no server logger
        console.error("Impersonation-stop logging failed:", auditResult.error);
      }
      const { error } = await authClient.admin.stopImpersonating();
      if (error) {
        toast.error(t("banner-stop-error"));
        return;
      }
      router.push("/users");
      router.refresh();
    } catch (error) {
      // eslint-disable-next-line no-console -- client components have no server logger
      console.error("Unexpected error while stopping impersonation:", error);
      toast.error(t("banner-stop-error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-3 border-b border-warning/30 bg-[color-mix(in_oklch,var(--warning)_15%,transparent)] px-4 py-2 text-sm font-medium text-warning"
    >
      <UserCog className="h-4 w-4 shrink-0" />
      <span>{t("banner-active", { name: userName })}</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-warning/40"
        onClick={handleStop}
        disabled={pending}
      >
        {pending ? t("banner-stopping") : t("banner-stop")}
      </Button>
    </div>
  );
}
