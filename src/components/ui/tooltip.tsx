"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { createContext, useContext } from "react";
import { cn } from "@/shared/lib/utils";
import { useTapToOpenTooltip } from "./use-tap-to-open-tooltip";

type TapToOpen = Pick<
  ReturnType<typeof useTapToOpenTooltip>,
  "onPointerDown" | "onClick"
>;

const TapToOpenContext = createContext<TapToOpen | null>(null);

function TooltipProvider({ ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider {...props} />;
}

function Tooltip({
  open: controlledOpen,
  defaultOpen,
  onOpenChange,
  ...props
}: TooltipPrimitive.Root.Props) {
  const tap = useTapToOpenTooltip({ defaultOpen, onOpenChange });

  if (controlledOpen !== undefined) {
    return (
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={controlledOpen}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        {...props}
      />
    );
  }

  return (
    <TapToOpenContext.Provider value={tap}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={tap.open}
        onOpenChange={tap.onOpenChange}
        {...props}
      />
    </TapToOpenContext.Provider>
  );
}

function TooltipTrigger({
  disabled,
  onPointerDown,
  onClick,
  ...props
}: TooltipPrimitive.Trigger.Props) {
  const tap = useContext(TapToOpenContext);

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      disabled={disabled}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (!disabled) {
          tap?.onPointerDown(event);
        }
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!disabled) {
          tap?.onClick(event);
        }
      }}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 4,
  side = "top",
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 max-w-xs origin-(--transform-origin) rounded-md bg-foreground px-2.5 py-1 text-xs text-background duration-100 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-instant:duration-0 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
