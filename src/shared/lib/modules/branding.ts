import { gatoBranding } from "@/modules.client.generated";
import type { GatoBranding } from "./gato-config";

export function getBranding(): GatoBranding {
  return gatoBranding;
}
