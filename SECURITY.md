# Security policy

GatoJS is a kit for multi-tenant business applications: sign-in, organizations, roles, invitations and an admin panel. A vulnerability here usually lands in every project built from it, so we take reports seriously.

## Reporting a vulnerability

**Do not open a public issue.** Report privately to **security@webamigos.pl**, or use [GitHub private vulnerability reporting](https://github.com/webamigos/gatojs/security/advisories/new).

Include what you have; a partial report is better than none:

- the affected area (core, a kit module, the CLI) and the kit version (`kitVersion` in `.wa/kit.json`, or the commit);
- steps to reproduce, or a proof of concept;
- the impact as you understand it (for example: data from another organization, privilege escalation, account takeover).

## What to expect

| Step | Target |
| --- | --- |
| Acknowledgement that we received your report | 48 hours |
| First assessment (confirmed, needs info, or not a vulnerability) | 7 days |
| Fix released for a confirmed issue | depends on severity; we keep you informed |

We credit reporters in the release notes unless you ask us not to.

## Scope

In scope:

- organization isolation (`getOrgContext()`, the runtime organization guard, `withoutTenantScope`);
- authentication and roles (better-auth configuration, the superadmin and admin rules, impersonation, service mode);
- the signup gate and invitations;
- kit modules (`api-keys`, `audit-logs`, `uploads`) and the CLI that assembles projects.

Out of scope:

- vulnerabilities in third-party dependencies with no GatoJS-specific impact: report them upstream (we still want to know if GatoJS makes one exploitable);
- projects built from GatoJS that changed the affected kit code;
- findings that need a compromised machine, server or administrator account.

## Supported versions

Security fixes go to the latest released kit version. Projects pick them up by moving to that version.
