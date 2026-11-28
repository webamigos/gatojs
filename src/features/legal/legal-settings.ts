import { legalConfig } from "./legal.config";
import {
  resolveLegalConfig,
  type LegalConfig,
  type LegalConfigError,
} from "./legal-config";

export const legalSettings: {
  config: LegalConfig;
  error: LegalConfigError | null;
} = resolveLegalConfig(legalConfig);
