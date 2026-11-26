"use client";

import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { clientComponentOverrides } from "@/modules.client.generated";
import { OverrideErrorBoundary } from "@/shared/components/override-error-boundary";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import {
  CONFIG_OVERRIDE_SOURCE,
  type ComponentHandle,
  type ComponentHandleProps,
  type OverrideComponentProps,
  type RegisteredComponentOverride,
} from "./component-overrides";
import { moduleVisibleTo } from "./slot-access";

export type OverridableProps<H extends ComponentHandle> =
  ComponentHandleProps<H> & { viewer: AccessContext };

type LazyOverrideComponent = LazyExoticComponent<
  ComponentType<OverrideComponentProps>
>;

const lazyComponents = new WeakMap<
  RegisteredComponentOverride,
  LazyOverrideComponent
>();

function lazyComponentOf(
  override: RegisteredComponentOverride,
): LazyOverrideComponent {
  const cached = lazyComponents.get(override);
  if (cached !== undefined) {
    return cached;
  }
  const component = lazy(override.component);
  lazyComponents.set(override, component);
  return component;
}

function visibleOverride(
  handle: string,
  viewer: AccessContext,
): RegisteredComponentOverride | undefined {
  const override = clientComponentOverrides.get(handle);
  if (override === undefined) {
    return undefined;
  }
  if (
    override.source === CONFIG_OVERRIDE_SOURCE ||
    moduleVisibleTo(override.source, viewer)
  ) {
    return override;
  }
  return undefined;
}

function overrideElement(
  override: RegisteredComponentOverride,
  props: OverrideComponentProps,
  Base: ComponentType<OverrideComponentProps>,
): ReactNode {
  const Override = lazyComponentOf(override);
  if (override.mode === "wrap") {
    return <Override {...props} Base={Base} />;
  }
  return <Override {...props} />;
}

export function overridable<H extends ComponentHandle>(
  handle: H,
  Base: ComponentType<ComponentHandleProps<H>>,
): ComponentType<OverridableProps<H>> {
  const RawBase = Base as ComponentType<OverrideComponentProps>;
  function Overridable({ viewer, ...props }: OverridableProps<H>): ReactNode {
    const override = visibleOverride(handle, viewer);
    const baseProps = props as OverrideComponentProps;
    if (override === undefined) {
      return <RawBase {...baseProps} />;
    }
    return (
      <OverrideErrorBoundary
        handle={handle}
        source={override.source}
        fallback={<RawBase {...baseProps} />}
      >
        <Suspense fallback={null}>
          {overrideElement(override, baseProps, RawBase)}
        </Suspense>
      </OverrideErrorBoundary>
    );
  }
  Overridable.displayName = `Overridable(${handle})`;
  return Overridable;
}
