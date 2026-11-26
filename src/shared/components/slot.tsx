import type { ReactNode } from "react";
import { moduleSlots } from "@/modules.generated";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import { visibleContributions } from "@/shared/lib/modules/slot-access";
import type {
  SlotComponentProps,
  SlotContext,
  SlotId,
} from "@/shared/lib/modules/slots";

export interface SlotProps<Id extends SlotId> {
  id: Id;
  context: SlotContext<Id>;
  viewer: AccessContext;
  fallback?: ReactNode;
}

export async function Slot<Id extends SlotId>({
  id,
  context,
  viewer,
  fallback = null,
}: SlotProps<Id>): Promise<ReactNode> {
  const contributions = visibleContributions(moduleSlots, id, viewer);
  if (contributions.length === 0) {
    return fallback;
  }
  const props: SlotComponentProps = context;
  const loaded = await Promise.all(
    contributions.map(async (contribution) => ({
      id: contribution.id,
      Component: (await contribution.component()).default,
    })),
  );
  return (
    <>
      {loaded.map(({ id: contributionId, Component }) => (
        <Component key={contributionId} {...props} />
      ))}
    </>
  );
}
