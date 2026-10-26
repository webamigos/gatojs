"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/routing";
import { authClient } from "@/shared/lib/auth/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "../contracts/auth.schemas";

interface PasswordTokenFormProps {
  title: string;
  description: string;
  expiredTitle: string;
  expiredDescription: string;
}

export function PasswordTokenForm({
  title,
  description,
  expiredTitle,
  expiredDescription,
}: PasswordTokenFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const token = searchParams.get("token") ?? "";
  const tokenError = searchParams.get("error");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit(values: ResetPasswordValues) {
    try {
      const result = await authClient.resetPassword({
        newPassword: values.password,
        token,
      });

      if (result.error) {
        toast.error(t("error-reset-password"));
        return;
      }

      router.push("/sign-in");
    } catch {
      toast.error(te("connection"));
    }
  }

  if (tokenError || !token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{expiredTitle}</CardTitle>
          <CardDescription>{expiredDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline block text-center"
          >
            {t("reset-password-request-new")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">{t("new-password")}</Label>
            <PasswordInput
              id="password"
              showPasswordLabel={t("show-password")}
              hidePasswordLabel={t("hide-password")}
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {t("error-password-too-short")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("confirm-password")}</Label>
            <PasswordInput
              id="confirm"
              showPasswordLabel={t("show-password")}
              hidePasswordLabel={t("hide-password")}
              aria-invalid={!!errors.confirm}
              {...register("confirm")}
            />
            {errors.confirm && (
              <p className="text-xs text-destructive">
                {t("error-passwords-mismatch")}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? tc("saving") : t("save-password")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
