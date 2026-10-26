"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { authClient } from "@/shared/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "../contracts/auth.schemas";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(values: ForgotPasswordValues) {
    try {
      const result = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: "/reset-password",
      });

      if (result.error) {
        toast.error(t("error-send-reset"));
        return;
      }

      setSentEmail(values.email);
      setSent(true);
    } catch {
      toast.error(te("connection"));
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("forgot-password-title")}</CardTitle>
        <CardDescription>{t("forgot-password-description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4">
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded-md">
              {t("forgot-password-sent", { email: sentEmail })}
            </div>
            <Link
              href="/sign-in"
              className="text-sm text-primary underline block text-center"
            >
              {t("forgot-password-back")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {t("error-invalid-email")}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t("sending") : t("send-link")}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              <Link href="/sign-in" className="text-primary underline">
                {t("forgot-password-back")}
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
