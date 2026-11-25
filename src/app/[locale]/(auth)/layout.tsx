import { BrandLogo } from "@/shared/components/brand-logo";
import { getBranding } from "@/shared/lib/modules/branding";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logo } = getBranding();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background">
      {logo !== undefined && <BrandLogo logo={logo} />}
      {children}
    </div>
  );
}
