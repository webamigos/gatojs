"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { authClient } from "@/shared/lib/auth/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const t = useTranslations("organizations");
  const router = useRouter();

  async function onSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={onSignOut}>
      {t("sign-out")}
    </Button>
  );
}
