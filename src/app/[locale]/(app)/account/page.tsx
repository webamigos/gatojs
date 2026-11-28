import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "@/env";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { requireUser } from "@/shared/lib/auth/helpers";
import { PageHeader } from "@/shared/components/page-header";
import { Slot } from "@/shared/components/slot";
import { AccountDetails } from "@/features/account/components/account-details";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";

interface AccountPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const context = await requireModuleAccess("account");
  const user = await requireUser();
  const t = await getTranslations("account");
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <AccountDetails name={user.name} email={user.email} />
      <ChangePasswordForm />
      <Slot
        id="account.sections"
        context={{ userId: user.id }}
        viewer={{
          userRole: context.userRole,
          orgRole: context.orgRole,
          multiOrg: env.MULTI_ORG,
        }}
      />
    </div>
  );
}
