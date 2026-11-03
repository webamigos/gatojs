import { fileHash } from "../assemble/hash.js";
import { compareCodePoint } from "../compare.js";
import { mergeFile } from "./merge.js";
import type { KitFile, KitSnapshot } from "./snapshot.js";

export type PlanAction =
  | "zaktualizowano"
  | "scalono"
  | "dodano"
  | "usunięto"
  | "konflikt"
  | "do decyzji";

export type PlannedFile = {
  path: string;
  action: PlanAction;
  reason: string | null;
  content: Buffer | null;
  mode: number | null;
};

export type UpdatePlan = { files: PlannedFile[]; mismatchedBase: string[] };

type PlanInput = {
  base: KitSnapshot;
  target: KitSnapshot;
  recordedHashes: Record<string, string>;
  readProject: (path: string) => Promise<Buffer | null>;
};

type Decision = { file: PlannedFile | null; mismatchedBase: boolean };

const MANAGED = "managed";

function hash(path: string, content: Buffer): string {
  return fileHash(path, content, { managedFiles: [] });
}

function planned(
  path: string,
  action: PlanAction,
  fields: Partial<Omit<PlannedFile, "path" | "action">> = {},
): PlannedFile {
  return { path, action, reason: null, content: null, mode: null, ...fields };
}

function undecided(path: string, reason: string): Decision {
  return {
    file: planned(path, "do decyzji", { reason }),
    mismatchedBase: false,
  };
}

async function mergeChanged(
  path: string,
  base: Buffer,
  project: Buffer,
  kit: KitFile,
  input: PlanInput,
): Promise<PlannedFile> {
  const merged = await mergeFile({
    path,
    base,
    ours: project,
    theirs: kit.content,
    labels: {
      ours: "projekt",
      base: `v${input.base.version}`,
      theirs: `v${input.target.version}`,
    },
  });
  if ("binary" in merged) {
    return planned(path, "konflikt", {
      reason: "plik binarny zmieniony w projekcie i w kicie",
    });
  }
  return planned(path, merged.conflicts > 0 ? "konflikt" : "scalono", {
    content: merged.content,
    mode: kit.mode,
  });
}

async function decide(path: string, input: PlanInput): Promise<Decision> {
  const base = input.base.files.get(path);
  const kit = input.target.files.get(path);
  const project = await input.readProject(path);

  if (!base) {
    if (!kit) {
      return { file: null, mismatchedBase: false };
    }
    if (!project) {
      return {
        file: planned(path, "dodano", { content: kit.content, mode: kit.mode }),
        mismatchedBase: false,
      };
    }
    if (hash(path, project) === hash(path, kit.content)) {
      return { file: null, mismatchedBase: false };
    }
    return {
      file: planned(path, "konflikt", {
        reason: "plik projektu na ścieżce nowego pliku kitu",
      }),
      mismatchedBase: false,
    };
  }

  const baseHash = hash(path, base.content);
  if (kit && hash(path, kit.content) === baseHash) {
    return { file: null, mismatchedBase: false };
  }
  if (!project) {
    if (!kit) {
      return { file: null, mismatchedBase: false };
    }
    return undecided(path, "usunięty w projekcie, zmieniony w kicie");
  }

  const projectHash = hash(path, project);
  const recordedHash = input.recordedHashes[path];
  const recordedMatchesBase =
    recordedHash === undefined ||
    recordedHash === MANAGED ||
    recordedHash === baseHash;
  const projectEqualsBase = projectHash === baseHash && recordedMatchesBase;
  const mismatchedBase =
    projectHash === recordedHash && recordedHash !== baseHash;

  if (!kit) {
    if (projectEqualsBase) {
      return { file: planned(path, "usunięto"), mismatchedBase };
    }
    return {
      ...undecided(path, "zmieniony w projekcie, usunięty w kicie"),
      mismatchedBase,
    };
  }
  if (projectEqualsBase) {
    return {
      file: planned(path, "zaktualizowano", {
        content: kit.content,
        mode: kit.mode,
      }),
      mismatchedBase,
    };
  }
  if (projectHash === hash(path, kit.content)) {
    return { file: null, mismatchedBase };
  }
  return {
    file: await mergeChanged(path, base.content, project, kit, input),
    mismatchedBase,
  };
}

export async function planUpdate(input: PlanInput): Promise<UpdatePlan> {
  const paths = [
    ...new Set([...input.base.files.keys(), ...input.target.files.keys()]),
  ].sort(compareCodePoint);
  const files: PlannedFile[] = [];
  const mismatchedBase: string[] = [];
  for (const path of paths) {
    const decision = await decide(path, input);
    if (decision.file) {
      files.push(decision.file);
    }
    if (decision.mismatchedBase) {
      mismatchedBase.push(path);
    }
  }
  return { files, mismatchedBase };
}
