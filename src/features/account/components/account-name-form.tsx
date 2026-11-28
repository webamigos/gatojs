"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/routing";
import { updateAccountNameCommand } from "../services/commands/update-account-name-command";
import {
  accountNameSchema,
  type AccountNameValues,
} from "../contracts/account.schemas";

export function AccountNameForm({ defaultName }: { defaultName: string }) {
  const t = useTranslations("account");
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountNameValues>({
    resolver: zodResolver(accountNameSchema),
    defaultValues: { name: defaultName },
  });

  async function onSubmit(values: AccountNameValues) {
    const result = await updateAccountNameCommand(values);
    if (result.success) {
      toast.success(t("name-saved"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2" noValidate>
      <Label htmlFor="account-name">{t("name")}</Label>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          id="account-name"
          className="max-w-sm"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        <Button type="submit" disabled={isSubmitting}>
          {t("save-name")}
        </Button>
      </div>
      {errors.name && (
        <p className="text-xs text-destructive">{t("name-invalid")}</p>
      )}
    </form>
  );
}
