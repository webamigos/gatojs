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
import { signUpSchema, type SignUpValues } from "../contracts/auth.schemas";

interface SignUpFormProps {
  invitationId?: string;
}

export function SignUpForm({ invitationId }: SignUpFormProps) {
  const router = useRouter();
  const t = useTranslations("auth");
  const te = useTranslations("errors");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
  });

  async function onSubmit(values: SignUpValues) {
    try {
      const payload = invitationId ? { ...values, invitationId } : values;
      const result = await authClient.signUp.email(payload);

      if (result.error) {
        toast.error(t("error-sign-up"));
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
        <CardTitle>{t("sign-up-title")}</CardTitle>
        <CardDescription>{t("sign-up-description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input
              id="name"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">
                {t("error-name-required")}
              </p>
            )}
          </div>
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
            <Label htmlFor="password">{t("password")}</Label>
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
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("signing-up") : t("sign-up-submit")}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            {t("have-account")}{" "}
            <Link href="/sign-in" className="text-primary underline">
              {t("sign-in-submit")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
