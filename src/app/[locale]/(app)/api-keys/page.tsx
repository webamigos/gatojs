import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { ApiKeysManager } from "@/features/api-keys/components/api-keys-manager";
import { listApiKeysQuery } from "@/features/api-keys/services/queries/api-key-queries";

interface ApiKeysPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ApiKeysPage({ params }: ApiKeysPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModuleAccess("api-keys");

  const [t, keys] = await Promise.all([
    getTranslations("api-keys"),
    listApiKeysQuery(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <ApiKeysManager keys={keys} />
    </div>
  );
}
