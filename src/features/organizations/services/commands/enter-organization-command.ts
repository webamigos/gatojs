"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/shared/lib/prisma";
import { toUserRole } from "@/shared/lib/auth/roles";
import { handleCommandError } from "@/shared/utils/error-handling";
import type { OperationResult } from "@/shared/types/common";
import { canEnterOrganization } from "../organization-access";

const NO_ACCESS = "Brak dostępu do organizacji";

const organizationIdSchema = z.string().min(1);

export async function enterOrganizationCommand(
  organizationId: unknown,
): Promise<OperationResult> {
  try {
    const parsed = organizationIdSchema.safeParse(organizationId);
    if (!parsed.success) {
      return { success: false, error: NO_ACCESS };
    }
    const { auth } = await import("@/shared/lib/auth");
    const session = await auth.api.getSession({
      headers: await headers(),
      query: { disableCookieCache: true },
    });
    if (!session?.user) {
      return { success: false, error: NO_ACCESS };
    }
    const allowed = await canEnterOrganization({
      userId: session.user.id,
      userRole: toUserRole(session.user.role),
      organizationId: parsed.data,
    });
    if (!allowed) {
      return { success: false, error: NO_ACCESS };
    }
    await prisma.session.update({
      where: { id: session.session.id },
      data: { activeOrganizationId: parsed.data },
    });
    return { success: true };
  } catch (error) {
    return handleCommandError(error, NO_ACCESS);
  }
}
