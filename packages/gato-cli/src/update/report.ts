import { compareCodePoint } from "../compare.js";
import type { PlanAction, PlannedFile, UpdatePlan } from "./plan.js";
import type { KitSnapshot } from "./snapshot.js";

const ACTION_ORDER: PlanAction[] = [
  "updated",
  "merged",
  "added",
  "removed",
  "conflict",
  "needs decision",
];
const ACTION_WIDTH = "needs decision".length;
const SCHEMA_PREFIX = "prisma/schema/";

function fileLine(file: PlannedFile): string {
  const reason = file.reason === null ? "" : ` (${file.reason})`;
  return `  ${file.action.padEnd(ACTION_WIDTH)} ${file.path}${reason}`;
}

function mismatchedBaseWarning(count: number, from: string): string {
  const source = `from the v${from} tag`;
  if (count === 1) {
    return `Warning: 1 file differs ${source}; treated it as changed in the project`;
  }
  return `Warning: ${count} files differ ${source}; treated them as changed in the project`;
}

export function planReport(input: {
  plan: UpdatePlan;
  from: string;
  to: string;
  dryRun: boolean;
}): string[] {
  const { plan, from, to } = input;
  const header = input.dryRun
    ? `Update plan for GatoJS ${from} → ${to} (project not changed)`
    : `Updating GatoJS ${from} → ${to}`;
  const items = ACTION_ORDER.flatMap((action) =>
    plan.files
      .filter((file) => file.action === action)
      .sort((a, b) => compareCodePoint(a.path, b.path))
      .map(fileLine),
  );
  const warning =
    plan.mismatchedBase.length > 0
      ? [mismatchedBaseWarning(plan.mismatchedBase.length, from)]
      : [];
  return [
    header,
    ...(items.length > 0 ? items : ["  no file changes"]),
    ...warning,
  ];
}

function schemaChanged(base: KitSnapshot, target: KitSnapshot): boolean {
  const paths = new Set([...base.files.keys(), ...target.files.keys()]);
  return [...paths]
    .filter((path) => path.startsWith(SCHEMA_PREFIX))
    .some((path) => {
      const before = base.files.get(path)?.content;
      const after = target.files.get(path)?.content;
      return !before || !after || !before.equals(after);
    });
}

function newEnvNames(base: KitSnapshot, target: KitSnapshot): string[] {
  const known = new Set(
    base.manifests.flatMap((manifest) => manifest.env.map(({ name }) => name)),
  );
  const added = target.manifests
    .flatMap((manifest) => manifest.env.map(({ name }) => name))
    .filter((name) => !known.has(name));
  return [...new Set(added)].sort(compareCodePoint);
}

export function successHints(base: KitSnapshot, target: KitSnapshot): string[] {
  const hints: string[] = [];
  if (schemaChanged(base, target)) {
    hints.push(`npx prisma migrate dev --name kit-${target.version}`);
  }
  const envNames = newEnvNames(base, target);
  if (envNames.length > 0) {
    hints.push(
      `New variables in .env.example: ${envNames.join(", ")}; add them to .env`,
    );
  }
  return hints;
}
