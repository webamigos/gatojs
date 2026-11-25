import Image from "next/image";
import type { GatoLogo } from "@/shared/lib/modules/gato-config";

export function BrandLogo({ logo }: { logo: GatoLogo }) {
  return (
    <Image
      src={logo.src}
      alt={logo.alt}
      width={logo.width}
      height={logo.height}
      unoptimized
    />
  );
}
