"use client";

import * as React from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Label } from "./label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

function FormField({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-field"
      className={cn("space-y-2", className)}
      {...props}
    />
  );
}

function FormLabel({
  className,
  required,
  tooltip,
  ...props
}: React.ComponentProps<typeof Label> & {
  required?: boolean;
  tooltip?: string;
}) {
  return (
    <Label
      data-slot="form-label"
      className={cn("flex items-center gap-1", className)}
      {...props}
    >
      {props.children}
      {required && <span className="text-destructive">*</span>}
      {tooltip && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              aria-label={tooltip}
              className="text-muted-foreground hover:text-foreground cursor-default"
            >
              <CircleHelp aria-hidden className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Label>
  );
}

function FormError({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  if (!children) {
    return null;
  }
  return (
    <p
      data-slot="form-error"
      className={cn("text-xs text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
}

function FormHint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="form-hint"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export { FormField, FormLabel, FormError, FormHint };
