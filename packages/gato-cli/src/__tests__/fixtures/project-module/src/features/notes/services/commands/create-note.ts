import { prisma } from "@/shared/lib/prisma";
import type { OrgContext } from "@/shared/lib/auth/org-context";
import { emitEvent, eventOrigin } from "@/shared/lib/events";

export async function createNote(
  context: OrgContext,
  title: string,
): Promise<{ id: string }> {
  const note = await prisma.note.create({
    data: { organizationId: context.organizationId, title },
    select: { id: true },
  });
  await emitEvent(eventOrigin(context), "notes.created", {
    noteId: note.id,
    title,
  });
  return { id: note.id };
}
