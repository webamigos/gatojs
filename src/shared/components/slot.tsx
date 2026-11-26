import "server-only";
import { Suspense, type ComponentType, type ReactNode } from "react";
import { moduleSlots } from "@/modules.generated";
import { SlotErrorBoundary } from "@/shared/components/slot-error-boundary";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import { logger } from "@/shared/lib/logger";
import { visibleContributions } from "@/shared/lib/modules/slot-access";
import type {
  ServerSlotId,
  SlotComponentProps,
  SlotContext,
} from "@/shared/lib/modules/slots";

export interface SlotProps<Id extends ServerSlotId> {
  id: Id;
  context: SlotContext<Id>;
  viewer: AccessContext;
  fallback?: ReactNode;
}

interface LoadedContribution {
  id: string;
  Component: ComponentType<SlotComponentProps>;
}

export async function Slot<Id extends ServerSlotId>({
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
  const settled = await Promise.allSettled(
    contributions.map((contribution) => contribution.component()),
  );
  const loaded = settled.flatMap((result, index): LoadedContribution[] => {
    const contributionId = contributions[index].id;
    if (result.status === "rejected") {
      logger.error("Slot contribution failed to load", {
        slot: id,
        contribution: contributionId,
        error: result.reason,
      });
      return [];
    }
    return [{ id: contributionId, Component: result.value.default }];
  });
  if (loaded.length === 0) {
    return fallback;
  }
  return (
    <>
      {loaded.map(({ id: contributionId, Component }) => (
        <SlotErrorBoundary key={contributionId} contributionId={contributionId}>
          <Suspense fallback={null}>
            <Component {...props} />
          </Suspense>
        </SlotErrorBoundary>
      ))}
    </>
  );
}
