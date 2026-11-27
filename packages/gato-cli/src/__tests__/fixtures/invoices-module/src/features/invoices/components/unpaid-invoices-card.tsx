import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listUnpaidInvoicesQuery } from "../services/queries/list-unpaid-invoices-query";

interface UnpaidInvoicesCardProps {
  organizationId: string;
}

export default async function UnpaidInvoicesCard({
  organizationId,
}: UnpaidInvoicesCardProps) {
  const [t, invoices] = await Promise.all([
    getTranslations("invoices"),
    listUnpaidInvoicesQuery(),
  ]);
  return (
    <Card data-organization-id={organizationId}>
      <CardHeader>
        <CardTitle>{t("unpaid-title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("unpaid-empty")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {invoices.map((invoice) => (
              <li key={invoice.id}>{invoice.number}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
