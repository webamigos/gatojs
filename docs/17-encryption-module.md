# The `encryption` module: per-organization envelope encryption

After reading this you will know:

- what `encryption` adds to a project, what it deliberately leaves out, and when not to add it;
- how to configure `ENCRYPTION_MASTER_KEY` locally, in CI and in production, and what stops the server at startup;
- the envelope format and why it is pinned by a fixed vector;
- how `encryptForOrganization` and `decryptForOrganization` use a data key per organization;
- what happens when the master key changes or an organization is deleted.

Verified against the code: branch `feat/module-encryption`, 2026-11-23.

Sources:

- `kit/modules/encryption.json`
- `packages/crypto/src/` (`envelope.ts`, `aes-gcm.ts`, `master-key.ts`, `key-provider.ts`, `local-key-provider.ts`,
  `probe.ts`, `assert-encryption-available.ts`) with tests in `__tests__/`
- `src/features/encryption/` (`module.ts`, `env.ts`, `services/encryption-key-provider.ts`,
  `services/organization-encryption.ts`) with tests, including
  `services/__tests__/organization-encryption.integration.test.ts`
- `prisma/schema/encryption.prisma`
- `src/instrumentation.ts`, `packages/env/src/` (`requiredForProvider`, `verifyEnvOnStartup`)
- [ADR-58](adrs/58-organization-data-keys-are-wrapped-rows-created-on-first-use.md)

## What it is for

A module that stores sensitive text (tokens of an integration, notes a customer must not see in a database dump)
encrypts it before writing and decrypts it after reading. Each organization has its own data key, so a payload
of one organization cannot be decrypted with another organization's key, and deleting an organization makes its
payloads unreadable.

The module adds no UI, no route and no Compose service. It adds:

| Part | Where |
| --- | --- |
| `@gatojs/crypto` (project package, copied like any GatoJS file) | `packages/crypto/` |
| Model `OrganizationDataKey`, table `organization_data_keys` | `prisma/schema/encryption.prisma`, relation `dataKey` on `Organization` |
| `encryptForOrganization`, `decryptForOrganization`, `OrganizationDataKeyMissingError` | `src/features/encryption/services/organization-encryption.ts` |
| `ENCRYPTION_PROVIDER`, `ENCRYPTION_MASTER_KEY` | `src/features/encryption/env.ts`, `.env.example` region `wa:modules` |

Out of scope in this version:

- **KMS providers.** Only `ENCRYPTION_PROVIDER=local` exists. `aws-kms` and `scaleway-kms` come later behind the
  same `KeyProvider` interface (packages spec 4.4).
- **Key rotation.** Neither the master key nor a data key can be rotated; see [Changing the master key](#master-key-change).
- **Searching or indexing encrypted fields.** The ciphertext is random per call (fresh IV), so equal plaintexts
  give different payloads.

Do not add the module for data the database is allowed to read (filters, sorting, reports), or for passwords
(hash them instead).

<a id="install"></a>

## Install and remove

```bash
npm run wa -- add encryption
npx prisma migrate dev --name add-encryption
```

Then set `ENCRYPTION_MASTER_KEY` in `.env` (next section). `npm run wa -- remove encryption` removes the files; the
`organization_data_keys` table stays until a migration drops it, and payloads written by other modules stay
unreadable without it.

<a id="env"></a>

## Configuration

| Variable | Required | Rule |
| --- | --- | --- |
| `ENCRYPTION_PROVIDER` | no | `local` (also when blank or unset). Any other value stops the server. |
| `ENCRYPTION_MASTER_KEY` | yes, for `local` | 32 bytes: 64 hex characters, or base64 of exactly 32 bytes. Surrounding whitespace is trimmed. In production it must not be the `.env.example` value. |

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Hex is checked first, because a 64-character hex string is also valid base64 (of 48 bytes). A base64 key of any
length other than 32 bytes is rejected with the generation command in the message.

The `.env.example` value (`0011…eeff`) works in development and tests. Integration tests use
`ENCRYPTION_MASTER_KEY` from `src/test/integration/setup-env.ts`, e2e from `e2e/env.ts`.

<a id="startup"></a>

### What stops the server

`env.ts` validates the key with `parseMasterKey` inside the schema, so core's `verifyEnvOnStartup` (called from
`src/instrumentation.ts`) prints a report and exits with code 1 when the key is missing, malformed, or the example
value in production. The report names `ENCRYPTION_MASTER_KEY`.

The full provider probe (`probeEncryptionProvider`: generate a data key, unwrap it, compare the bytes) runs once
per process on the first `encryptForOrganization` or `decryptForOrganization`. A failed probe makes every call
throw `EncryptionUnavailableError` with the provider's message; it never touches the database first. The probe
runs on first use and not in `instrumentation.ts` because a module does not edit core files (ADR-58).

<a id="format"></a>

## The envelope format

`encryptContent(plaintext, dataKey)` returns `base64(IV[12 bytes] ‖ ciphertext ‖ auth tag[16 bytes])` with
AES-256-GCM. `decryptContent` rejects a payload shorter than 28 bytes ("expected at least 28 bytes") and any
payload whose tag does not verify (changed byte, wrong key).

The format is the contract with every stored payload. `envelope.test.ts` decrypts a fixed vector produced by
Ragen's implementation, because a round-trip test still passes when both sides change the same way. Do not change
the format; a new format needs a version prefix and a migration path.

Data keys are wrapped with the same envelope under the master key.

<a id="api"></a>

## Using it in a module

```ts
import "server-only";

import { encryptForOrganization } from "@/features/encryption/services/organization-encryption";

const context = await getOrgContext();
assertServiceModeConfirmed(context, confirmation);
const secret = await encryptForOrganization(context.organizationId, input.token);
await prisma.integration.create({
  data: { organizationId: context.organizationId, secret },
});
```

| Function | Behaviour |
| --- | --- |
| `encryptForOrganization(organizationId, plaintext)` | Probes the provider (once), reads the organization's data key and creates it when there is none, returns the payload string. |
| `decryptForOrganization(organizationId, ciphertext)` | Probes the provider (once), reads the data key, returns the plaintext. Throws `OrganizationDataKeyMissingError` when the organization has no key (it never creates one), and an error when the payload belongs to another organization or was changed. |

Rules:

- Take `organizationId` from `getOrgContext()` (or `requireModuleAccess()`), never from the request body.
- The functions are services, not server actions: the calling command checks permissions and service mode.
- Your module's `requires` should list `encryption` when it cannot work without it.
- Store the payload in a `String` (or `Text`) column; it is base64.

<a id="data-key"></a>

## Data keys

One `OrganizationDataKey` row per organization (`organizationId` is unique), created on the first encryption.
When two requests encrypt for a new organization at once, both write with `upsert` and an empty `update`, so both
use the row that was stored first. Every query filters by `organizationId`, and the tenant-scope guard rejects one
that does not.

The row is deleted with its organization (`onDelete: Cascade`), which makes that organization's payloads
permanently unreadable.

<a id="master-key-change"></a>

## Changing the master key

There is no rotation. A different `ENCRYPTION_MASTER_KEY` passes the startup check (it is a valid key), but every
stored data key fails to unwrap: the probe still passes (it uses a fresh key), and each
`encryptForOrganization` / `decryptForOrganization` for an organization with a stored key throws. Keep the master
key in a secret store, back it up with the database, and do not change it. Rotation (re-wrapping every row under a
new master key) is a follow-up.

<a id="tests"></a>

## Tests

| What | Test |
| --- | --- |
| Format pinned by Ragen's vector, 28-byte minimum, tampering | `packages/crypto/src/__tests__/envelope.test.ts` |
| Hex first, base64 of 32 bytes, 48-byte base64 rejected with the hint, trimming | `packages/crypto/src/__tests__/master-key.test.ts` |
| Probe fails for an unusable provider | `packages/crypto/src/__tests__/probe.test.ts` |
| Env rules, production example value | `src/features/encryption/__tests__/env.test.ts`, `src/__tests__/instrumentation.test.ts` |
| Own key per organization, other organization's payload fails, random IV | `src/features/encryption/services/__tests__/organization-encryption.test.ts` |
| Two organizations on a real database, concurrent first use, cascade delete | `services/__tests__/organization-encryption.integration.test.ts` |

`packages/crypto/src/` and `src/features/encryption/services/` are critical files in `mutation-gate.json`.
