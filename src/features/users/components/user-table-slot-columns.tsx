"use client";

import type { ColumnDef } from "@/components/ui/data-table";
import { ClientSlotContribution } from "@/shared/components/client-slot";
import { isColumnContribution } from "@/shared/lib/modules/column-slots";
import type { RegisteredContribution } from "@/shared/lib/modules/slots";
import type { UserAccountListItem } from "../contracts/user-account.types";

function isUsableColumn(
  contribution: RegisteredContribution,
): contribution is RegisteredContribution & { header: string } {
  if (isColumnContribution(contribution)) {
    return true;
  }
  // eslint-disable-next-line no-console -- client components have no server logger
  console.error("Slot contribution is not a column:", contribution.id);
  return false;
}

export function buildContributedUserColumns(
  contributions: readonly RegisteredContribution[],
  translate: (key: string) => string,
  organizationId: string,
): ColumnDef<UserAccountListItem>[] {
  return contributions.filter(isUsableColumn).map((contribution) => {
    const label = translate(`${contribution.module}.${contribution.header}`);
    return {
      id: contribution.id,
      header: label,
      meta: { label },
      enableSorting: false,
      cell: ({ row }) => (
        <ClientSlotContribution
          contribution={contribution}
          props={{ row: row.original, organizationId }}
        />
      ),
    };
  });
}
