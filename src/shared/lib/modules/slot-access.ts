import {
  canAccessModule,
  moduleByKey,
  type AccessContext,
} from "@/shared/lib/auth/permissions";
import { roleAllows, type RegisteredContribution } from "./slots";

function moduleAllows(module: string, viewer: AccessContext): boolean {
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
      moduleAllows(contribution.module, viewer) &&
      roleAllows(contribution, viewer),
  );
}
