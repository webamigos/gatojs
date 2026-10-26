"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/routing";
import { authClient } from "@/shared/lib/auth/client";
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
import { CreateOrganizationForm } from "./create-organization-form";

interface OrgSwitcherProps {
  multiOrg: boolean;
}

export function OrgSwitcher({ multiOrg }: OrgSwitcherProps) {
  if (!multiOrg) {
    return null;
  }
  return <MultiOrgSwitcher />;
}

function MultiOrgSwitcher() {
  const t = useTranslations("organizations");
  const router = useRouter();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);

  async function onSwitch(organizationId: string) {
    setSwitching(true);
    try {
      const result = await authClient.organization.setActive({
        organizationId,
      });
      if (result.error) {
        toast.error(result.error.message ?? t("toast-generic-error"));
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
      {organizations && organizations.length > 1 && (
        <Select
          value={activeOrganization?.id ?? ""}
          onValueChange={(value) => {
            if (value && value !== activeOrganization?.id) {
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
    </div>
  );
}
