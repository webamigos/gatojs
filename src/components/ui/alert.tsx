import { AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export interface InlineAlertProps {
  variant: "warning" | "destructive";
  title: string;
  description?: string;
  className?: string;
}

export function InlineAlert({
  variant,
  title,
  description,
  className,
}: InlineAlertProps) {
  const Icon = variant === "warning" ? AlertTriangle : AlertCircle;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        variant === "warning" &&
          "border-warning/30 bg-[color-mix(in_oklch,var(--warning)_15%,transparent)] text-warning",
        variant === "destructive" &&
          "border-destructive/30 bg-[color-mix(in_oklch,var(--destructive)_15%,transparent)] text-destructive",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="text-sm font-medium leading-none">{title}</p>
        {description && <p className="text-sm opacity-80">{description}</p>}
      </div>
    </div>
  );
}
