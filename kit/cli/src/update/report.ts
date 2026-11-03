import { compareCodePoint } from "../compare.js";
import type { PlanAction, PlannedFile, UpdatePlan } from "./plan.js";
import type { KitSnapshot } from "./snapshot.js";

const ACTION_ORDER: PlanAction[] = [
  "zaktualizowano",
  "scalono",
  "dodano",
  "usunięto",
  "konflikt",
  "do decyzji",
];
const ACTION_WIDTH = "zaktualizowano".length;
const SCHEMA_PREFIX = "prisma/schema/";

function fileLine(file: PlannedFile): string {
  const reason = file.reason === null ? "" : ` (${file.reason})`;
  return `  ${file.action.padEnd(ACTION_WIDTH)} ${file.path}${reason}`;
}

export function planReport(input: {
  plan: UpdatePlan;
  from: string;
  to: string;
  dryRun: boolean;
}): string[] {
  const { plan, from, to } = input;
  const header = input.dryRun
    ? `Plan aktualizacji wa-kit ${from} → ${to} (bez zmian w projekcie)`
    : `Aktualizacja wa-kit ${from} → ${to}`;
  const items = ACTION_ORDER.flatMap((action) =>
    plan.files
      .filter((file) => file.action === action)
      .sort((a, b) => compareCodePoint(a.path, b.path))
      .map(fileLine),
  );
  const warning =
    plan.mismatchedBase.length > 0
      ? [
          `Uwaga: ${plan.mismatchedBase.length} plików różni się od v${from} z tagu; potraktowano je jak zmienione w projekcie`,
        ]
      : [];
  return [
    header,
    ...(items.length > 0 ? items : ["  bez zmian w plikach"]),
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
      `Nowe zmienne w .env.example: ${envNames.join(", ")}; uzupełnij .env`,
    );
  }
  return hints;
}
