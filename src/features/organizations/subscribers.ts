import { defineSubscribers } from "@/shared/lib/events";
import { runOrganizationSetup } from "@/shared/lib/modules/setup";

export const subscribers = defineSubscribers({
  "organizations.created": {
    id: "organizations.module-setup",
    run: async (event) => {
      await runOrganizationSetup(event.organizationId, {
        hook: "onOrganizationCreated",
      });
    },
  },
});
