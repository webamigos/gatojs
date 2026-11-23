# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/adrs/`**: ADR files (`NN-<decision>.md`, from ADR-53; index in `docs/adrs/README.md`). Older decisions `D01`–`D52` are still in `docs/decyzje.md` until the English migration splits them into ADR files with the same numbers. Read the ones that touch the area you're about to work in.
- **`docs/lessons.md`**: titles of non-obvious gotchas by area; open the lessons for the area you touch.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates `GLOSSARY.md` lazily when terms actually get resolved. A new decision is a new file in `docs/adrs/` with the next free number, from `docs/adrs/TEMPLATE.md`; never a new entry in `docs/decyzje.md`.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md          ← created lazily
├── docs/adrs/           ← ADR-53 onwards, one file per decision
├── docs/decyzje.md      ← D01–D52 until the English migration
├── docs/lessons.md      ← lessons index (titles only)
└── src/
```

`docs/` and `GLOSSARY.md` exist only in the kit repository; projects assembled from the kit do not get them.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts D29 (empty `packages/*` workspaces), but worth reopening because…_ (for ADR files: _Contradicts ADR-53, …_)
