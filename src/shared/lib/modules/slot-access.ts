import {
  canAccessModule,
  moduleByKey,
  type AccessContext,
} from "@/shared/lib/auth/permissions";
import { roleAllows, type RegisteredContribution } from "./slots";

export function anonymousViewer(multiOrg: boolean): AccessContext {
  return { userRole: "user", orgRole: null, multiOrg };
}

export function moduleVisibleTo(
  module: string,
  viewer: AccessContext,
): boolean {
  const moduleDef = moduleByKey(module);
  return moduleDef !== null && canAccessModule(moduleDef, viewer);
}

export function visibleContributions(
  contributions: readonly RegisteredContribution[],
  slotId: string,
  viewer: AccessContext,
): RegisteredContribution[] {
  return contributions.filter(
    (contribution) =>
      contribution.slot === slotId &&
      moduleVisibleTo(contribution.module, viewer) &&
      roleAllows(contribution, viewer),
  );
}
