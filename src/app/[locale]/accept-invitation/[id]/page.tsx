import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/routing";
import { logger } from "@/shared/lib/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";

interface AcceptInvitationPageProps {
  params: Promise<{ locale: string; id: string }>;
}

const APP_HOME_PATH = "/dashboard";

export default async function AcceptInvitationPage({
  params,
}: AcceptInvitationPageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const requestHeaders = await headers();
  const { auth } = await import("@/shared/lib/auth");
  const t = await getTranslations("organizations");

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("accept-title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("accept-description")}
            </p>
            <div className="flex gap-2">
              <Link href="/sign-in" className={buttonVariants()}>
                {t("accept-sign-in")}
              </Link>
              <Link
                href={{ pathname: "/sign-up", query: { invitationId: id } }}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("accept-sign-up")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  let organizationId: string | null = null;
  try {
    const result = await auth.api.acceptInvitation({
      headers: requestHeaders,
      body: { invitationId: id },
    });
    organizationId = result?.invitation.organizationId ?? null;
  } catch (error) {
    logger.error("[ORG] Failed to accept invitation", { id, err: error });
  }

  if (organizationId) {
    try {
      await auth.api.setActiveOrganization({
        headers: requestHeaders,
        body: { organizationId },
      });
    } catch (error) {
      logger.error("[ORG] Failed to set active organization", {
        organizationId,
        err: error,
      });
    }
    redirect({ href: APP_HOME_PATH, locale });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("accept-error-title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("accept-error-generic")}
          </p>
          <Link href={APP_HOME_PATH} className="text-sm text-primary underline">
            {t("accept-back-to-app")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
