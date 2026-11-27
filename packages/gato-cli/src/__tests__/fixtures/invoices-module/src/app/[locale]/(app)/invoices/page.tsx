import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { InvoicesList } from "@/features/invoices/components/invoices-list";
import { listInvoicesQuery } from "@/features/invoices/services/queries/list-invoices-query";

interface InvoicesPageProps {
  params: Promise<{ locale: string }>;
}

export default async function InvoicesPage({ params }: InvoicesPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModuleAccess("invoices");

  const [t, invoices] = await Promise.all([
    getTranslations("invoices"),
    listInvoicesQuery(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <InvoicesList invoices={invoices} />
    </div>
  );
}
