# ADR-58: Each organization's data key is one wrapped row, created on first use, with no rotation yet

**Status:** Proposed
**Date:** 2026-11-23
**Decided by:** an agent with Patryk (packages spec 4.4, plan Task 4)

## Context

The packages spec (section 4.4) adds `@gatojs/crypto` and an `encryption` module: AES-256-GCM envelope
encryption with a master key (`ENCRYPTION_MASTER_KEY`, provider `local`) wrapping per-organization data keys,
and an API `encryptForOrganization(organizationId, plaintext)` / `decryptForOrganization(organizationId, ciphertext)`.
The spec fixes the envelope format (Ragen's `base64(IV[12] ‖ ciphertext ‖ tag[16])`) and leaves open how data keys
are stored, when they are created, how the probe runs at startup and what happens on rotation.

## Decision

- **One table, one row per organization.** `OrganizationDataKey` (`prisma/schema/encryption.prisma`, table
  `organization_data_keys`): `id`, `organizationId` (`@unique`, relation to `Organization` with
  `onDelete: Cascade`), `wrappedKey`, `createdAt`. No key version or key id column.
- **Wrapping.** `KeyProvider` (`packages/crypto/src/key-provider.ts`) has `generateDataKey()` →
  `{ wrappedKey, plaintextKey }` and `unwrapDataKey(wrappedKey)`, the shape of a KMS `GenerateDataKey` / `Decrypt`
  pair, so KMS providers can be added behind it. `LocalKeyProvider` generates 32 random bytes and wraps them with
  the same AES-256-GCM envelope under the master key; it rejects a wrapped key that unwraps to anything but 32 bytes.
- **Created on first use.** `encryptForOrganization` reads the row and, when there is none, generates a key and
  writes it with `upsert` and an empty `update`, then uses the row the database returned. Two concurrent first
  encryptions therefore end up on the same stored key. `decryptForOrganization` never creates a row: without one
  it throws `OrganizationDataKeyMissingError`.
- **Every query filters by `organizationId`.** The model has `organizationId`, so the tenant-scope guard covers it.
  The API takes `organizationId` from the caller, who gets it from `getOrgContext()`; the functions are plain
  server-only services, not server actions, so they do not check service-mode confirmation themselves (the calling
  command does).
- **No key cache.** Each call unwraps the data key again. With `local` this is one AES-GCM decryption.
- **Startup check in the env schema, full probe on first use.** `src/features/encryption/env.ts` runs
  `parseMasterKey` inside the schema, so `verifyEnvOnStartup` (in core's `instrumentation.ts`) stops the server
  with a report naming `ENCRYPTION_MASTER_KEY` when the key is missing, malformed, or equal to the `.env.example`
  value in production. `probeEncryptionProvider` (generate, unwrap, compare) runs once per process on the first
  encrypt or decrypt (`ensureEncryptionAvailable`), because a module does not edit core files and core has no
  per-module instrumentation hook.

## Rejected alternatives

- **A column on `Organization`.** A module does not edit core files; only a relation field goes in through the
  `wa:relations` region.
- **Creating the key when the organization is created.** Needs a hook into core's organization creation and
  leaves existing organizations without a key after `wa add encryption`; lazy creation covers both.
- **Deriving per-organization keys from the master key (HKDF with the organization id).** No table, but rotating
  the master key would change every derived key and require re-encrypting all content; a KMS cannot derive keys
  this way either.
- **Caching unwrapped data keys in memory.** Not needed for `local`; it belongs with the KMS providers, where an
  unwrap is a network call.

## Consequences

- Deleting an organization deletes its data key, so its encrypted content becomes unreadable (crypto-shredding).
- Changing `ENCRYPTION_MASTER_KEY` makes every stored data key unwrappable and every payload unreadable. There is
  no rotation: re-wrapping the rows under a new master key (and a key version column) is a follow-up, as are the
  `aws-kms` and `scaleway-kms` providers (spec 4.4).
- A module that encrypts calls `encryptForOrganization(context.organizationId, …)` after its own guard and
  `assertServiceModeConfirmed`, and stores the returned string.

## Enforcement

- `packages/crypto/src/__tests__/envelope.test.ts` pins the format with Ragen's vector.
- `src/features/encryption/services/__tests__/organization-encryption.test.ts` and
  `organization-encryption.integration.test.ts` (two organizations, concurrent first use, cascade delete).
- `src/__tests__/instrumentation.test.ts` checks the startup report names `ENCRYPTION_MASTER_KEY`.
- `mutation-gate.json` lists `packages/crypto/src/` and `src/features/encryption/services/` as critical.
- The tenant-scope guard (`src/shared/lib/tenant-scope/`) rejects an unfiltered query on `OrganizationDataKey`.

## Sources

- `docs/superpowers/specs/2026-11-22-packages-design.md`, section 4.4
- `docs/superpowers/plans/2026-11-22-packages.md`, Task 4
- Ragen `packages/crypto` (envelope format and test vector)
