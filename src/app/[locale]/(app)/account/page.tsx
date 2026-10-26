import { setRequestLocale } from "next-intl/server";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { requireUser } from "@/shared/lib/auth/helpers";
import { AccountDetails } from "@/features/account/components/account-details";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";

interface AccountPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModuleAccess("account");
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <AccountDetails name={user.name} email={user.email} />
      <ChangePasswordForm />
    </div>
  );
}
