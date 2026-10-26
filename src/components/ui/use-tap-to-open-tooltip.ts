"use client";

import type { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";

type ChangeEventDetails = TooltipPrimitive.Root.ChangeEventDetails;

interface Options {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: ChangeEventDetails) => void;
}

const TOUCH_TOOLTIP_VISIBLE_MS = 3500;

function createChangeDetails(
  reason: ChangeEventDetails["reason"],
  event: Event,
  trigger?: Element,
): ChangeEventDetails {
  let canceled = false;
  let propagationAllowed = false;
  return {
    reason,
    event,
    trigger,
    cancel: () => {
      canceled = true;
    },
    allowPropagation: () => {
      propagationAllowed = true;
    },
    get isCanceled() {
      return canceled;
    },
    get isPropagationAllowed() {
      return propagationAllowed;
    },
    preventUnmountOnClose: () => {},
  } as ChangeEventDetails;
}

// base-ui opens a tooltip on mouse hover and keyboard focus only, and closes
// it on a press of its own trigger - so a finger never sees it. Touch and pen
// taps toggle it here; mouse clicks are left to hover. A tap also focuses the
// trigger, which opens the tooltip before the click lands, so the toggle is
// taken from the state at the moment of the press. Nothing but a tap elsewhere
// closes a touch tooltip otherwise, and a tap on an action button would leave
// it hanging over the result of that action - hence the timeout.
export function useTapToOpenTooltip({
  defaultOpen = false,
  onOpenChange,
}: Options = {}) {
  const [open, setOpen] = useState(defaultOpen);
  const [openedByTap, setOpenedByTap] = useState(false);
  const lastPointerType = useRef("mouse");
  const openAtPress = useRef(false);

  const commit = (
    next: boolean,
    details: ChangeEventDetails,
    byTap: boolean,
  ) => {
    onOpenChange?.(next, details);
    if (details.isCanceled) {
      return;
    }
    setOpenedByTap(next && byTap);
    setOpen(next);
  };

  const closeAfterTimeout = useEffectEvent(() => {
    commit(false, createChangeDetails("none", new Event("timeout")), false);
  });

  useEffect(() => {
    if (!open || !openedByTap) {
      return;
    }
    const timer = window.setTimeout(
      closeAfterTimeout,
      TOUCH_TOOLTIP_VISIBLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open, openedByTap]);

  return {
    open,
    onOpenChange: (next: boolean, details: ChangeEventDetails) => {
      if (details.reason !== "trigger-press") {
        commit(next, details, false);
      }
    },
    onPointerDown: (event: PointerEvent) => {
      lastPointerType.current = event.pointerType;
      openAtPress.current = open;
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (lastPointerType.current === "mouse") {
        return;
      }
      commit(
        !openAtPress.current,
        createChangeDetails(
          "trigger-press",
          event.nativeEvent,
          event.currentTarget,
        ),
        true,
      );
    },
  };
}
