"use client";

import type { WrapperProps } from "@/shared/lib/modules/component-overrides";
import type { InviteUserDialogProps } from "@/features/users/components/invite-user-dialog";

export default function InviteDialogWithNotes({
  Base,
  ...props
}: WrapperProps<InviteUserDialogProps>) {
  return (
    <span data-notes-invite="" className="contents">
      <Base {...props} />
    </span>
  );
}
