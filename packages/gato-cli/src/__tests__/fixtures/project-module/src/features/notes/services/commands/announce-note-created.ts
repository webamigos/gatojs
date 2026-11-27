import type { OrgContext } from "@/shared/lib/auth/org-context";
import { emitEvent, eventOrigin } from "@/shared/lib/events";

export async function announceNoteCreated(
  context: OrgContext,
  note: { id: string; title: string },
): Promise<void> {
  await emitEvent(eventOrigin(context), "notes.created", {
    noteId: note.id,
    title: note.title,
  });
}
