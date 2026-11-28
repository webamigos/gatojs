import type { ReactNode } from "react";
import { env } from "@/env";
import { moduleSlots } from "@/modules.generated";
import { BrandLogo } from "@/shared/components/brand-logo";
import { Slot } from "@/shared/components/slot";
import { getBranding } from "@/shared/lib/modules/branding";
import {
  anonymousViewer,
  visibleContributions,
} from "@/shared/lib/modules/slot-access";

export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<ReactNode> {
  const { locale } = await params;
  const { logo } = getBranding();
  const viewer = anonymousViewer(env.MULTI_ORG);
  const hasFooter =
    visibleContributions(moduleSlots, "auth.footer", viewer).length > 0;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background">
      {logo !== undefined && <BrandLogo logo={logo} />}
      {children}
      {hasFooter && (
        <footer className="flex justify-center px-4">
          <Slot id="auth.footer" context={{ locale }} viewer={viewer} />
        </footer>
      )}
    </div>
  );
}
