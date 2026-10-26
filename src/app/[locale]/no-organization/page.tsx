import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { env } from "@/shared/lib/env";
import {
  getOrgContext,
  NoOrganizationError,
} from "@/shared/lib/auth/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateOrganizationForm } from "@/features/organizations/components/create-organization-form";
import { SignOutButton } from "@/features/organizations/components/sign-out-button";

interface NoOrganizationPageProps {
  params: Promise<{ locale: string }>;
}

async function hasOrganization(): Promise<boolean> {
  try {
    await getOrgContext();
    return true;
  } catch (error) {
    if (error instanceof NoOrganizationError) {
      return false;
    }
    throw error;
  }
}

export default async function NoOrganizationPage({
  params,
}: NoOrganizationPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (await hasOrganization()) {
    redirect({ href: "/dashboard", locale });
  }

  const t = await getTranslations("organizations");
  const multiOrg = env.MULTI_ORG;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("no-organization-title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {multiOrg
              ? t("no-organization-multi-org-description")
              : t("no-organization-description")}
          </p>
          {multiOrg && <CreateOrganizationForm />}
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
