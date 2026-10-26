"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changePasswordCommand } from "../services/commands/change-password-command";
import {
  changePasswordSchema,
  type ChangePasswordValues,
} from "../contracts/auth.schemas";

export function ChangePasswordForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const te = useTranslations("errors");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  async function onSubmit(values: ChangePasswordValues) {
    try {
      const result = await changePasswordCommand(
        values.currentPassword,
        values.newPassword,
      );

      if (result.success) {
        toast.success(t("password-changed"));
        reset();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(te("generic"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("change-password-title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("current-password")}</Label>
            <PasswordInput
              id="currentPassword"
              showPasswordLabel={t("show-password")}
              hidePasswordLabel={t("hide-password")}
              aria-invalid={!!errors.currentPassword}
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="text-xs text-destructive">
                {t("error-current-password-required")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("new-password")}</Label>
            <PasswordInput
              id="newPassword"
              placeholder={t("new-password-placeholder")}
              showPasswordLabel={t("show-password")}
              hidePasswordLabel={t("hide-password")}
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">
                {t("error-new-password-too-short")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword">
              {t("confirm-new-password")}
            </Label>
            <PasswordInput
              id="confirmNewPassword"
              showPasswordLabel={t("show-password")}
              hidePasswordLabel={t("hide-password")}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {t("error-new-passwords-mismatch")}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? tc("saving") : t("change-password-submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
