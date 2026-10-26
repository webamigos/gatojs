"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--success)]" />,
        info: <InfoIcon className="size-4 text-[var(--info)]" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--warning)]" />,
        error: <OctagonXIcon className="size-4 text-[var(--destructive)]" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg":
            "color-mix(in oklch, var(--success) 15%, var(--popover))",
          "--success-text": "var(--success)",
          "--success-border":
            "color-mix(in oklch, var(--success) 30%, transparent)",
          "--error-bg":
            "color-mix(in oklch, var(--destructive) 15%, var(--popover))",
          "--error-text": "var(--destructive)",
          "--error-border":
            "color-mix(in oklch, var(--destructive) 30%, transparent)",
          "--warning-bg":
            "color-mix(in oklch, var(--warning) 15%, var(--popover))",
          "--warning-text": "var(--warning)",
          "--warning-border":
            "color-mix(in oklch, var(--warning) 30%, transparent)",
          "--info-bg": "color-mix(in oklch, var(--info) 15%, var(--popover))",
          "--info-text": "var(--info)",
          "--info-border": "color-mix(in oklch, var(--info) 30%, transparent)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
