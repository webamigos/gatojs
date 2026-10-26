"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { authClient } from "@/shared/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signInSchema, type SignInValues } from "../contracts/auth.schemas";

export function SignInForm() {
  const router = useRouter();
  const t = useTranslations("auth");
  const te = useTranslations("errors");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
  });

  async function onSubmit(values: SignInValues) {
    try {
      const result = await authClient.signIn.email(values);

      if (result.error) {
        toast.error(t("error-sign-in"));
        return;
      }

      router.push("/dashboard");
    } catch {
      toast.error(te("connection"));
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("sign-in-title")}</CardTitle>
        <CardDescription>{t("sign-in-description")}</CardDescription>
      </CardHeader>
      <CardContent>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("password")}</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-primary underline"
              >
                {t("forgot-password")}
              </Link>
            </div>
            <PasswordInput
              id="password"
              showPasswordLabel={t("show-password")}
              hidePasswordLabel={t("hide-password")}
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {t("error-password-required")}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("signing-in") : t("sign-in-submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
