import { defineGatoConfig } from "@/shared/lib/modules/gato-config";

export default defineGatoConfig({
  modules: {
    dashboard: {
      nav: { "dashboard.home": { order: 5 } },
    },
  },
});
