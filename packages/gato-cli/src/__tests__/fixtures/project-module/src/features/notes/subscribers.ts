import { defineSubscribers } from "@/shared/lib/events";
import { logger } from "@/shared/lib/logger";

export const subscribers = defineSubscribers({
  "organizations.member-removed": {
    id: "notes.log-removed-member",
    run: (event) => {
      logger.info("notes: member left", {
        organizationId: event.organizationId,
        userId: event.payload.userId,
      });
    },
  },
  "notes.created": [
    {
      id: "notes.log-created",
      run: (event) => {
        logger.info("notes: note created", {
          organizationId: event.organizationId,
          noteId: event.payload.noteId,
        });
      },
    },
  ],
});
