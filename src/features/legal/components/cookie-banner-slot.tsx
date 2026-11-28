import type { ComponentType } from "react";
import type { SlotContext } from "@/shared/lib/modules/slots";
import { logger } from "@/shared/lib/logger";
import { legalSettings } from "../legal-settings";
import { CookieBanner } from "./cookie-banner";

const CookieBannerSlot: ComponentType<SlotContext<"app.root">> =
  function CookieBannerSlot() {
    if (legalSettings.error !== null) {
      logger.error("Invalid legal config", { error: legalSettings.error });
      return null;
    }
    return <CookieBanner privacyHref="/privacy" />;
  };

export default CookieBannerSlot;
