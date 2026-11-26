"use client";

import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { clientModuleSlots } from "@/modules.client.generated";
import { SlotErrorBoundary } from "@/shared/components/slot-error-boundary";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import { visibleContributions } from "@/shared/lib/modules/slot-access";
import type {
  ClientSlotId,
  RegisteredContribution,
  SlotComponentProps,
  SlotContext,
} from "@/shared/lib/modules/slots";

export interface ClientSlotProps<Id extends ClientSlotId> {
  id: Id;
  context: SlotContext<Id>;
  viewer: AccessContext;
  fallback?: ReactNode;
}

type LazySlotComponent = LazyExoticComponent<ComponentType<SlotComponentProps>>;

const lazyComponents = new WeakMap<RegisteredContribution, LazySlotComponent>();

function lazyComponentOf(
  contribution: RegisteredContribution,
): LazySlotComponent {
  const cached = lazyComponents.get(contribution);
  if (cached !== undefined) {
    return cached;
  }
  const component = lazy(contribution.component);
  lazyComponents.set(contribution, component);
  return component;
}

export function ClientSlot<Id extends ClientSlotId>({
  id,
  context,
  viewer,
  fallback = null,
}: ClientSlotProps<Id>): ReactNode {
  const contributions = visibleContributions(clientModuleSlots, id, viewer);
  if (contributions.length === 0) {
    return fallback;
  }
  const props: SlotComponentProps = context;
  return (
    <Suspense fallback={null}>
      {contributions.map((contribution) => {
        const Component = lazyComponentOf(contribution);
        return (
          <SlotErrorBoundary
            key={contribution.id}
            contributionId={contribution.id}
          >
            <Component {...props} />
          </SlotErrorBoundary>
        );
      })}
    </Suspense>
  );
}
