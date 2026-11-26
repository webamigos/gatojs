import type { ComponentType } from "react";
import type { OrgRole } from "@/shared/lib/auth/roles";
import type {
  ClientSlotId,
  SlotComponentLoader,
  SlotContext,
  SlotContribution,
} from "./slots";

export interface ColumnContribution extends SlotContribution {
  header: string;
}

export interface ColumnContributionInput<Id extends ClientSlotId> {
  id: string;
  priority: number;
  roles?: readonly OrgRole[];
  header: string;
  cell: () => Promise<{ default: ComponentType<SlotContext<Id>> }>;
}

export function defineColumnContribution<Id extends ClientSlotId>(
  slot: Id,
  input: ColumnContributionInput<Id>,
): ColumnContribution {
  return {
    slot,
    id: input.id,
    priority: input.priority,
    roles: input.roles,
    header: input.header,
    component: input.cell as SlotComponentLoader,
  };
}

export function isColumnContribution<T extends SlotContribution>(
  contribution: T,
): contribution is T & { header: string } {
  const { header } = contribution as { header?: unknown };
  return typeof header === "string" && header.length > 0;
}
