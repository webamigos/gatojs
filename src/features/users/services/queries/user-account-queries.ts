"use server";

import { notFound } from "next/navigation";
import { prisma } from "@/shared/lib/prisma";
import { getAdminUserOrNull } from "@/shared/lib/auth/helpers";
import { toUserRole } from "@/shared/lib/auth/roles";
import type { UserAccountListItem } from "../../contracts/user-account.types";

export async function getUserAccountsQuery(): Promise<UserAccountListItem[]> {
  const admin = await getAdminUserOrNull();
  if (!admin) {
    notFound();
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  return users.map((user) => ({ ...user, role: toUserRole(user.role) }));
}
