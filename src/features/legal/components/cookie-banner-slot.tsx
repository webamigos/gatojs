import type { ComponentType } from "react";
import type { SlotContext } from "@/shared/lib/modules/slots";
import { CookieBanner } from "./cookie-banner";

const CookieBannerSlot: ComponentType<SlotContext<"app.header.actions">> =
  function CookieBannerSlot() {
    return <CookieBanner privacyHref="/privacy" />;
  };

export default CookieBannerSlot;
