# Task 20: Gato file protection becomes blocking

Extensibility plan Task 20 (`docs/superpowers/plans/2026-11-23-extensibility.md`). Precondition met: gato-cli 0.14.0 and
create-gato-app 0.3.12 shipped T2 and T3 in warning mode.

## Files and signatures

- `packages/gato-cli/src/doctor/mode.ts`: `FILE_PROTECTION_MODE: FileProtectionMode = "block"`.
- `.claude/hooks/protect-gato-files.mjs`: `PROTECTION_MODE = "block"`. New exported pure function
  `hookOutput({ action, message })` → `{ status: 0 | 2, stdout: string, stderr: string }`, used by the entrypoint, so the
  warn-mode `ask` output stays tested while no process run reaches it:
  - `{ action: "allow" }` → `{ status: 0, stdout: "", stderr: "" }`;
  - `{ action: "ask", message }` → `{ status: 0, stdout: JSON.stringify(<the T3 ask object>), stderr: "" }`, the ask object
    being `{ systemMessage: message, hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask",
    permissionDecisionReason: message, additionalContext: message } }`;
  - `{ action: "block", message }` → `{ status: 2, stdout: "", stderr: message + "\n" }`.
- Versions: `core` minor (0.36.0), `gato-cli` minor (0.15.0) with bundle rebuild, `create-gato-app` patch (0.3.13) with
  the pin. No `kitFormat` change (no contract change).
- Docs: `docs/11-praca-z-kitem.md`, `docs/16-cli-wa.md` (exit codes), `kit/README.md`, ADR-59 status line
  ("blocking since core 0.36.0 / gato-cli 0.15.0").

## Behaviours

- `FILE_PROTECTION_MODE` → `"block"`; `PROTECTION_MODE` → `"block"`.
- `doctorFiles({ projectDir, cli: "gato", log })` without `mode`, one modified Gato file → `{ exitCode: 1 }`, log names
  the file; with that file ejected → `{ exitCode: 0 }`; clean project → `{ exitCode: 0 }` and `GatoJS files: no changes`.
- Default-mode output for one modified file has no line containing `warning`.
- Hook process, Edit of a Gato file (`src/shared/lib/audit.ts`, owned by `core`) → exit 2, stdout empty, stderr
  `<the T3 Gato message>\n`. Same for a file of a second module, a new file written at a Gato path, and a new Gato path
  under a missing directory.
- Hook process, ejected Gato file → exit 0, no output; project/managed/seed files → exit 0, no output (unchanged).
- `hookOutput` returns the three literal shapes above.

## Mutations to kill

- Either constant left at `"warn"`.
- `hookOutput`: ask JSON field dropped or renamed, block status not 2, block message not on stderr or without newline,
  allow printing anything.
- Entrypoint not using `hookOutput`'s status (exit 0 on block).
