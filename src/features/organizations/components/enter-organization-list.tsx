"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { enterOrganizationCommand } from "../services/commands/enter-organization-command";
import type { SwitchableOrganization } from "../contracts/organization-switcher.types";

interface EnterOrganizationListProps {
  organizations: SwitchableOrganization[];
}

export function EnterOrganizationList({
  organizations,
}: EnterOrganizationListProps) {
  const t = useTranslations("organizations");
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onEnter(organizationId: string) {
    setPendingId(organizationId);
    try {
      const result = await enterOrganizationCommand(organizationId);
      if (!result.success) {
        toast.error(result.error ?? t("toast-generic-error"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("enter-organization-title")}</p>
      <ul className="space-y-1">
        {organizations.map((organization) => (
          <li key={organization.id}>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={pendingId !== null}
              onClick={() => onEnter(organization.id)}
            >
              {organization.name}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
