"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { enterOrganizationCommand } from "../services/commands/enter-organization-command";
import type { SwitchableOrganization } from "../contracts/organization-switcher.types";
import { CreateOrganizationForm } from "./create-organization-form";

interface OrgSwitcherProps {
  organizations: SwitchableOrganization[];
  activeOrganizationId: string;
  canCreateOrganization?: boolean;
}

export function OrgSwitcher({
  organizations,
  activeOrganizationId,
  canCreateOrganization = false,
}: OrgSwitcherProps) {
  const t = useTranslations("organizations");
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);
  const canSwitch = organizations.length > 1;

  if (!canSwitch && !canCreateOrganization) {
    return null;
  }

  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId,
  );

  async function onSwitch(organizationId: string) {
    setSwitching(true);
    try {
      const result = await enterOrganizationCommand(organizationId);
      if (!result.success) {
        toast.error(result.error ?? t("toast-generic-error"));
        return;
      }
      router.refresh();
    } catch {
      toast.error(t("toast-generic-error"));
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={t("switcher-label")}
      className="flex items-center gap-2"
    >
      {canSwitch && (
        <Select
          value={activeOrganizationId}
          onValueChange={(value) => {
            if (value && value !== activeOrganizationId) {
              onSwitch(value);
            }
          }}
          disabled={switching}
        >
          <SelectTrigger className="w-full" aria-label={t("switcher-label")}>
            <span className="truncate">
              {activeOrganization?.name ?? t("switcher-label")}
            </span>
          </SelectTrigger>
          <SelectContent>
            {organizations.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>
                {organization.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {canCreateOrganization && (
        <>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("create-organization")}
            onClick={() => setCreating(true)}
          >
            <PlusIcon />
          </Button>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("create-organization")}</DialogTitle>
                <DialogDescription>
                  {t("create-organization-description")}
                </DialogDescription>
              </DialogHeader>
              <CreateOrganizationForm onCreated={() => setCreating(false)} />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
