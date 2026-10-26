"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/routing";
import { authClient } from "@/shared/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugifyOrganizationName } from "../contracts/organization-slug";

interface CreateOrganizationFormProps {
  onCreated?: () => void;
}

export function CreateOrganizationForm({
  onCreated,
}: CreateOrganizationFormProps) {
  const t = useTranslations("organizations");
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setCreating(true);
    try {
      const result = await authClient.organization.create({
        name: trimmed,
        slug: slugifyOrganizationName(trimmed),
      });
      if (result.error) {
        toast.error(result.error.message ?? t("toast-generic-error"));
        return;
      }
      toast.success(t("toast-created"));
      setName("");
      onCreated?.();
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error(t("toast-generic-error"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organization-name">{t("organization-name")}</Label>
        <Input
          id="organization-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={creating || !name.trim()}>
        {creating ? t("creating") : t("create-submit")}
      </Button>
    </form>
  );
}
