import { BrandLogo } from "@/shared/components/brand-logo";
import { getBranding } from "@/shared/lib/modules/branding";
import { cn } from "@/shared/lib/utils";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logo } = getBranding();
  return (
    <div
      className={cn(
        "min-h-screen flex items-center justify-center bg-background",
        logo !== undefined && "flex-col gap-6",
      )}
    >
      {logo !== undefined && <BrandLogo logo={logo} />}
      {children}
    </div>
  );
}
