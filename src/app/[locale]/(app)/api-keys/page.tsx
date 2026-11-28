import { setRequestLocale } from "next-intl/server";
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

  const keys = await listApiKeysQuery();

  return <ApiKeysManager keys={keys} />;
}
