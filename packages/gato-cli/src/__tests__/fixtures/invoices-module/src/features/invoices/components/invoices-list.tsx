"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/routing";
import { useServiceModeAction } from "@/shared/components/service-mode/use-service-mode-action";
import type { InvoiceRow } from "../contracts/invoice.types";
import { issueInvoiceCommand } from "../services/commands/issue-invoice-command";

interface InvoicesListProps {
  invoices: InvoiceRow[];
}

export function InvoicesList({ invoices }: InvoicesListProps) {
  const t = useTranslations("invoices");
  const router = useRouter();
  const { run, dialog } = useServiceModeAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function issue(id: string) {
    setBusyId(id);
    try {
      const result = await run(issueInvoiceCommand, { id });
      if (result === null) {
        return;
      }
      if (result.success) {
        toast.success(t("issued-success"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusyId(null);
    }
  }

  if (invoices.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <>
      <ul className="divide-y rounded-md border">
        {invoices.map((invoice) => (
          <li
            key={invoice.id}
            className="flex items-center justify-between gap-4 p-3"
          >
            <span className="font-medium">{invoice.number}</span>
            <span className="text-muted-foreground text-sm">
              {t(`status-${invoice.status}`)}
            </span>
            {invoice.status === "draft" && (
              <Button
                size="sm"
                disabled={busyId === invoice.id}
                onClick={() => issue(invoice.id)}
              >
                {t("issue")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {dialog}
    </>
  );
}
