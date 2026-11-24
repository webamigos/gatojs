---
title: 'A Zod 4 intersection throws `Unmergable intersection` when one side keeps raw values the other side parses; use `.overwrite(() => ({}))` on the rule side'
areas: ['testing']
topics: ['zod', 'env', 'gatojs-env']
---

# A Zod 4 intersection throws `Unmergable intersection` when one side keeps raw values the other side parses; use `.overwrite(() => ({}))` on the rule side

**In short**: to run env rules on the raw variables next to a parsing object, `coreEnvSchema` intersects the object with a rules-only schema. If that side outputs the raw input, Zod merges `"465"` with `465` and throws an `Error` (not an issue). `.transform(() => ({}))` is skipped once a rule has added an issue, so it does not help. `.overwrite(() => ({}))` runs as a check even after a non-aborting issue, so the output is always `{}` and both sides' issues reach the report.

**Context**: Task 1 of the self-hosting plan (mail providers, ADR-64) on 2026-11-24. `SMTP_URL` next to `SMTP_PORT` or `SMTP_SECURE` is an error, but the parsed values have defaults (587, `false`), so the rule must see whether the raw variable was set.

**Problem**:

- `z.intersection(object, z.looseObject({}).superRefine(rules).transform(() => ({})))` passed every valid config and threw `Unmergable intersection. Error path: ["SMTP_PORT"]` for exactly the inputs the rule rejects.
- A `z.pipe` from the raw rules into the object would stop at the first side's issues and hide every other error from the startup report.

**Rule**: a rules-only side of an intersection ends in `.overwrite(() => ({}))` (see `rawMailRules` in `packages/env/src/core-env-schema.ts`). Test it with an input that breaks a rule and also has a variable whose parsed value differs from the raw one.

**Applies to**: `packages/env/src/core-env-schema.ts`, `checkEnv` (which intersects module schemas), any module `envSchema` that needs raw values.
