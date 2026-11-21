# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/decyzje.md`**: this repo's ADR log (entries `D01`, `D02`, …, each with status, context, decision, rejected alternatives, consequences, enforcement). Read the entries that touch the area you're about to work in; the index table at the top lists them by area.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates `GLOSSARY.md` lazily when terms actually get resolved. A new decision goes into `docs/decyzje.md` as the next free `D<nn>` entry in the existing format, never as a separate file under `docs/adr/`.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md          ← created lazily
├── docs/decyzje.md      ← ADR log (D01…)
└── src/
```

`docs/` and `GLOSSARY.md` exist only in the kit repository; projects assembled from the kit do not get them.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts D29 (empty `packages/*` workspaces), but worth reopening because…_
