---
title: 'Prisma 7 runs an `upsert` with an empty `update` as a read and an insert, so concurrent first writers fail with `P2002`'
areas: ['data']
topics: ['prisma', 'postgres', 'concurrency', 'upsert', 'encryption']
---

# Prisma 7 runs an `upsert` with an empty `update` as a read and an insert, so concurrent first writers fail with `P2002`

**In short**: `upsert({ where: { organizationId }, create, update: {} })` looks like an atomic "insert if absent", but on Prisma 7.10.1 with PostgreSQL 16 the query log shows `SELECT`, then `INSERT` in a transaction, not `INSERT … ON CONFLICT`. In 30 rounds of 10 parallel upserts, 261 of 300 calls failed with `P2002`. Catch `P2002` and read the stored row again.

**Context**: `wrappedKeyForWrite` in the `encryption` module (2026-11-25). Its documentation and ADR-58 said the empty-update upsert made two concurrent first encryptions share one stored key.

**Problem**:

- Prisma uses a native database upsert only when the query meets its conditions, and an empty `update` does not. Without the native upsert, the slower writer hits the unique index.
- The existing test with two parallel calls passed on the broken code: the connection pool was cold, so the calls never overlapped. Ten calls passed too until the test warmed the pool first (10 parallel `SELECT 1`), after which it failed every time.

**Rule**: Do not rely on `upsert` for "create once" under concurrency. Catch `Prisma.PrismaClientKnownRequestError` with code `P2002`, re-read the row by the unique key, and rethrow the original error when the re-read finds nothing. Check what SQL Prisma actually sends with `log: [{ emit: "event", level: "query" }]`. A race test needs a warm pool and enough parallel calls (about 10) to fail without the fix; show that red run.

**Applies to**: `src/features/encryption/services/organization-encryption.ts`, any "get or create" on a unique column, integration tests for concurrent writes.
