import { AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ReactNode } from "react";

export interface ErrorStateProps {
  variant?: "warning" | "destructive";
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  variant = "warning",
  title,
  description,
  action,
  className,
}: ErrorStateProps) {
  const Icon = variant === "destructive" ? AlertCircle : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card px-8 py-10 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-full",
          variant === "destructive" ? "bg-destructive/10" : "bg-warning/10",
        )}
      >
        <Icon
          className={cn(
            "size-4",
            variant === "destructive" ? "text-destructive" : "text-warning",
          )}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="max-w-xs text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
