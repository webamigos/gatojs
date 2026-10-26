"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormLabel, FormError } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ORG_ROLES } from "@/shared/lib/auth/roles";
import { inviteUserCommand } from "../services/commands/invite-user-command";
import {
  inviteUserSchema,
  type InviteUserValues,
} from "../contracts/user-account.schemas";

type InviteUserFormValues = z.input<typeof inviteUserSchema>;

export function InviteUserDialog() {
  const router = useRouter();
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteUserFormValues, unknown, InviteUserValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { name: "", email: "", role: ORG_ROLES.MEMBER },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
    }
    setOpen(next);
  }

  async function onSubmit(values: InviteUserValues) {
    const result = await inviteUserCommand(values);
    if (result.success) {
      toast.success(t("toast-invited"));
      handleOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error ?? t("toast-invite-error"));
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {t("invite-user")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{t("dialog-invite-title")}</DialogTitle>
              <DialogDescription>
                {t("dialog-invite-description")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <FormField>
                <FormLabel htmlFor="invite-user-name" required>
                  {t("name-label")}
                </FormLabel>
                <Input
                  id="invite-user-name"
                  placeholder={t("name-placeholder")}
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                {errors.name && (
                  <FormError>{t("error-name-required")}</FormError>
                )}
              </FormField>

              <FormField>
                <FormLabel htmlFor="invite-user-email" required>
                  {t("email-label")}
                </FormLabel>
                <Input
                  id="invite-user-email"
                  type="email"
                  placeholder={t("email-placeholder")}
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && (
                  <FormError>{t("error-invalid-email")}</FormError>
                )}
              </FormField>

              <FormField>
                <FormLabel htmlFor="invite-user-role" required>
                  {t("role-label")}
                </FormLabel>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="invite-user-role" className="w-full">
                        <SelectValue>
                          {(value: string | undefined) =>
                            value === ORG_ROLES.ADMIN
                              ? t("org-role-admin")
                              : t("org-role-member")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value={ORG_ROLES.MEMBER}
                          label={t("org-role-member")}
                        >
                          {t("org-role-member")}
                        </SelectItem>
                        <SelectItem
                          value={ORG_ROLES.ADMIN}
                          label={t("org-role-admin")}
                        >
                          {t("org-role-admin")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              <p className="text-xs text-muted-foreground">
                {t("password-reset-note")}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("submitting") : t("submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
