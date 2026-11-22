---
title: 'macOS lists directory entries in sorted order, so a test on a real directory cannot see a missing sort; Linux CI can'
areas: ['testing']
topics: ['mutation-testing', 'filesystem', 'stryker', 'sorting']
---

# macOS lists directory entries in sorted order, so a test on a real directory cannot see a missing sort; Linux CI can

**In short**: In the packages plan, Task 1, `workspacesBody` (`packages/gato-cli/src/generate/targets.ts`) and `workspaceDirs` (`scripts/lib/architecture/workspaces.ts`) sort `readdir` results by code point. Tests wrote `beta`, `alpha` and `Zeta` to a temp directory and asserted the sorted output. On macOS (APFS) they passed with the `.sort()` removed, and Stryker reported the "region body unsorted" mutant as surviving. On Linux (ext4) `readdir` order is hash-based, so the same code without the sort would produce an unstable Dockerfile region in CI.

**Context**: Packages plan Task 1, 2026-11-22.

**Problem**:

- Creating files in a scrambled order does not scramble the listing on APFS; the test looks like it checks the order and does not.
- The same applies to recursive walks: APFS lists `test` before `test-a`, so a walk yields `test/x.test.ts` before `test-a/y.test.ts`, while code point order puts `test-a/y.test.ts` first.

**Rule**: To test that code sorts a directory listing, either mock the I/O (`vi.mock("node:fs/promises")` or `vi.spyOn(fs, "readdirSync")` returning the real entries reversed), or pick names whose filesystem order differs from code point order (`src/x.ts` and `src-a/y.ts`: code point order puts `src-a/` first because `-` is 0x2D and `/` is 0x2F).

**Applies to**: any test of code that reads a directory and promises an order, the `wa generate` region bodies, architecture checks in `scripts/lib/architecture/`.
