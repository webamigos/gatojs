# Egress check: task plan (self-hosting Task 7, ADR-66)

Contract: [2026-11-23-self-hosting.md](2026-11-23-self-hosting.md), Task 7. This file fixes the signatures and the
behaviours the tests are written from, and records what changed against the plan after probing Docker.

## What probing showed (2026-11-27)

- Docker 24.0.2 (Docker Desktop, macOS): a container on an `internal: true` network has a default route via the
  bridge, and the embedded DNS forwards a name it does not own from the container onto the bridge. A capture on the
  bridge sees lookups and connections.
- Docker 28.5.2 (`docker:28-dind`, the engine family of `ubuntu-latest`): a container on an internal network has
  **no default route**, and the embedded DNS forwards nothing to a resolver outside the network
  (CVE-2024-29018 fix). The capture sees nothing, so a check built only for Docker 24 would fail its canary in CI.
- On both, the embedded DNS forwards a name it does not own to a resolver **inside** the internal network
  (moby 26.1.3, "Forward DNS requests into --internal networks"), from the container's own address. So every sealed
  service gets `dns: [<resolver>]`, where `<resolver>` is a fixed address in the sealed subnet held by a `sink`
  container that answers nothing (ICMP port unreachable, so lookups fail fast). Every lookup of a name that is not a
  container is a packet to `<resolver>:53` on the bridge.
- On Docker 28 a connection to an outside address cannot leave the container (no route; `ENETUNREACH`), so no packet
  exists to capture. The canary's connection is required only when the canary has a default route.
- `com.docker.network.bridge.name` names the bridge, so `capture` (host network) can listen on it before any service
  starts.

## Files

`kit/egress-check/` (kit-only through `kit/**`): its own package, `npm ci --prefix kit/egress-check`, tests with
`node --test` through `tsx`.

### `src/seal.ts`

```ts
export type ComposeFile = Record<string, unknown> & { services: Record<string, Record<string, unknown>> };
export type SealOptions = {
  image: string;        // app and migrate
  toolsImage: string;   // tools (the builder stage)
  checkImage: string;   // canary, sink, capture (alpine + tcpdump + curl)
  subnet: string;       // "172.30.0.0/16"
  resolver: string;     // "172.30.0.53", inside subnet
  bridge: string;       // "gato-egress", at most 15 characters
  pushSchema: boolean;  // true: migrate runs `prisma db push` (a repository without migrations)
};
export const NETWORK = "sealed";
export const RELAY_IMAGE = "axllent/mailpit:v1.34.0";
export function sealCompose(compose: ComposeFile, options: SealOptions): ComposeFile;
```

### `src/capture.ts`

```ts
export type Escape = { source: string; destination: string; name?: string };
export const CANARY_HOST = "egress-canary.invalid";
export const CANARY_ADDRESS = "192.0.2.1";
export function findEscapes(lines: readonly string[], subnet: string, options?: { resolver?: string }): Escape[];
export type Verdict = { exitCode: 0 | 1; lines: string[] };
export function verdict(
  escapes: readonly Escape[],
  context: { canary: string; routed: boolean; holders: ReadonlyMap<string, readonly string[]> },
): Verdict;
```

### `src/env-file.ts`

```ts
export function fillEnv(example: string, values: Readonly<Record<string, string>>): string;
```

### Not unit-tested (I/O, proved by the real run)

`src/scenario.ts` (admin through `tools`, sign-in, invitation seen in the relay, upload and download), `src/run.mts`
(build, environment, sealed project in a temp directory, capture, canary, verdict, tear-down), `Dockerfile` (check
image).

## Behaviours

### `findEscapes`

1. `findEscapes(["12:00:00.000000 IP 172.30.0.5.41234 > 172.30.0.3.5432: Flags [S]"], "172.30.0.0/16")` → `[]`.
2. `findEscapes(["12:00:00.000000 IP 172.30.0.5.41234 > 8.8.8.8.53: 1+ A? fonts.googleapis.com. (38)"], "172.30.0.0/16")`
   → `[{ source: "172.30.0.5", destination: "8.8.8.8:53", name: "fonts.googleapis.com" }]`.
3. `findEscapes(["12:00:00.000000 IP 172.30.0.5.41234 > 93.184.215.14.443: Flags [S]"], "172.30.0.0/16")`
   → `[{ source: "172.30.0.5", destination: "93.184.215.14:443" }]` (no `name` key).
4. Epoch timestamps (`tcpdump -tt`): `"1795738031.067217 IP 172.30.0.5.49322 > 93.184.215.14.443: Flags [S]"` → same
   shape as 3.
5. Resolver inside the subnet: `findEscapes(["1795738031.067217 IP 172.30.0.2.49322 > 172.30.0.53.53: 25387+ AAAA? example.com. (39)"], "172.30.0.0/16", { resolver: "172.30.0.53" })`
   → `[{ source: "172.30.0.2", destination: "172.30.0.53:53", name: "example.com" }]`. Without `options` the same line
   → `[]`.
6. The resolver's reply is not an escape: `"… IP 172.30.0.53 > 172.30.0.2: ICMP 172.30.0.53 udp port 53 unreachable, length 75"`
   with `{ resolver: "172.30.0.53" }` → `[]`. A packet to `172.30.0.53` on another port (`… > 172.30.0.53.80: Flags [S]`)
   → `[]`.
7. A packet whose source is outside the subnet is not an escape:
   `"12:00:00.000000 IP 10.0.0.9.53 > 172.30.0.5.41234: 1 NXDomain 0/0/0 (38)"` → `[]`.
8. Multicast and broadcast never leave the link: `"… IP 172.30.0.5.5353 > 224.0.0.251.5353: 0 [1q] PTR? _x._tcp.local. (40)"`
   and `"… IP 172.30.0.5.68 > 255.255.255.255.67: BOOTP/DHCP"` → `[]`.
9. A destination without a port (ICMP): `"… IP 172.30.0.5 > 192.0.2.1: ICMP echo request, id 1, seq 1, length 64"`
   → `[{ source: "172.30.0.5", destination: "192.0.2.1" }]`.
10. Lines that are not packets (`"listening on gato-egress, link-type EN10MB …"`, `""`, `"tcpdump: verbose output suppressed"`)
    → `[]`.
11. Repeats collapse: the same SYN three times, and an `A?` and an `AAAA?` for one name from one source to one
    destination, give one entry each. Order is first appearance.
12. Subnet bounds: with `"172.30.0.0/16"`, `172.31.0.1` is outside (escape) and `172.30.255.254` inside (no escape).
    With `"10.1.2.0/24"`, `10.1.3.1` is outside and `10.1.2.200` inside.

### `verdict`

Context used below: `canary: "172.30.0.9"`, `holders: new Map([["172.30.0.5", ["wa-egress-app-1"]], ["172.30.0.9", ["wa-egress-canary-1"]]])`.
`lookup` = `{ source: "172.30.0.9", destination: "172.30.0.53:53", name: "egress-canary.invalid" }`;
`connection` = `{ source: "172.30.0.9", destination: "192.0.2.1:80" }`.

13. `[lookup, connection]`, `routed: true` → `{ exitCode: 0, lines: ["no container tried to leave the network"] }`.
14. `[lookup]`, `routed: false` → exit 0, the same line.
15. `[lookup]`, `routed: true` → `{ exitCode: 1, lines: ["capture saw no canary attempt; refusing to report a clean result"] }`.
16. `[connection]`, `routed: true` → exit 1 with that line. `[]` with `routed: false` → exit 1 with that line.
17. A canary-shaped escape from another source does not count as the canary's: `[{ ...lookup, source: "172.30.0.5" }]`
    with `routed: false` → exit 1, first line the canary line.
18. `[lookup, connection, { source: "172.30.0.5", destination: "172.30.0.53:53", name: "example.com" }]`, `routed: true`
    → `{ exitCode: 1, lines: ["1 attempt to leave the network:", "  wa-egress-app-1 (172.30.0.5) -> example.com (172.30.0.53:53)"] }`.
19. Two offenders, one with no name and an unknown source:
    `[lookup, { source: "172.30.0.5", destination: "93.184.215.14:443" }, { source: "172.30.0.7", destination: "8.8.8.8:53", name: "a.example" }]`,
    `routed: false` → exit 1, lines `["2 attempts to leave the network:", "  wa-egress-app-1 (172.30.0.5) -> 93.184.215.14:443", "  unknown container (172.30.0.7) -> a.example (8.8.8.8:53)"]`.
20. A source with several holders over the run lists them joined: holders `["a-1", "b-1"]` → `"  a-1 or b-1 (…) -> …"`.
21. Canary missing and an offender: the canary line comes first, then the offender lines.

### `sealCompose` (on the parsed repository `docker-compose.selfhost.yml`, options `{ image: "app:check", toolsImage: "tools:check", checkImage: "check:check", subnet: "172.30.0.0/16", resolver: "172.30.0.53", bridge: "gato-egress", pushSchema: false }`)

22. `networks` is exactly `{ sealed: { internal: true, driver_opts: { "com.docker.network.bridge.name": "gato-egress" }, ipam: { config: [{ subnet: "172.30.0.0/16" }] } } }`.
23. Every service except `capture` has `networks` equal to `["sealed"]`, or (`sink` only) `{ sealed: { ipv4_address: "172.30.0.53" } }`,
    and `dns` equal to `["172.30.0.53"]`; no service has `network_mode` except `capture` (`"host"`).
24. No service has `build` or `ports`.
25. `app.image` and `migrate.image` are `"app:check"`, `tools.image` is `"tools:check"`; `db`, `minio`, `minio-init`
    keep their images; `tools` keeps `profiles: ["tools"]`, `minio` keeps `profiles: ["s3"]`.
26. Added services: `relay` (`image: "axllent/mailpit:v1.34.0"`, `environment.MP_DISABLE_VERSION_CHECK: "true"`),
    `canary` (`image: "check:check"`, its command looks up `egress-canary.invalid` and connects to `http://192.0.2.1/`),
    `sink` (`image: "check:check"`), `capture` (`image: "check:check"`, `network_mode: "host"`,
    `cap_add` contains `NET_RAW` and `NET_ADMIN`, `command` contains `-i` followed by `"gato-egress"`).
27. `pushSchema: false` leaves `migrate.command` as `["node_modules/.bin/prisma", "migrate", "deploy"]`; `pushSchema: true`
    makes it `["node_modules/.bin/prisma", "db", "push"]`.
28. The input is not changed (a deep copy is returned): after the call, the parsed file still has `app.build` and
    `app.ports`.
29. A fixture service that only has `network_mode: bridge` and `networks: ["default"]` ends with `networks: ["sealed"]`
    and no `network_mode`.
30. A fixture without `services` throws `"docker-compose.selfhost.yml has no services"`.

### `fillEnv`

31. `fillEnv("A=\nB=keep\n# C=\nD=1", { A: "x", C: "y" })` → `"A=x\nB=keep\nC=y\nD=1"`.
32. A key the example lacks is appended: `fillEnv("A=1", { Z: "9" })` → `"A=1\nZ=9"`.
33. Only the first matching line is replaced, and a value with `=` stays whole: `fillEnv("A=\nA=", { A: "p=q" })` → `"A=p=q\nA="`.
34. A commented line that is prose is not touched: `fillEnv("# A note=", { A: "x" })` → `"# A note=\nA=x"`.

### Added after the mutation review (2026-11-27)

38. `fillEnv("APP_URL=\nS3_BUCKET_2=", { APP_URL: "u", S3_BUCKET_2: "b" })` → `"APP_URL=u\nS3_BUCKET_2=b"`.
39. A prose comment that contains `KEY=` mid-line stays: `fillEnv("# Set A=1 for x", { A: "x" })` → `"# Set A=1 for x\nA=x"`.
    A commented assignment with or without spaces is filled: `fillEnv("#B=\n#  C=", { B: "y", C: "z" })` → `"B=y\nC=z"`.
40. A TCP packet to port 53 without a query: `"… IP 172.30.0.5.41234 > 8.8.8.8.53: Flags [S]"` → `[{ source: "172.30.0.5", destination: "8.8.8.8:53" }]`
    (no `name`, no throw).
41. A lookup-shaped payload on another port has no name: `"… IP 172.30.0.5.41234 > 8.8.8.8.5353: 0 A? x.example. (30)"`
    → `[{ source: "172.30.0.5", destination: "8.8.8.8:5353" }]`.
42. Different names, or keys that only differ by where a field ends, stay apart: `A? a.example.` and `A? b.example.` from
    `172.30.0.5` to `8.8.8.8.53` give two entries; `172.30.0.5 → 11.1.1.1:80` and `172.30.0.51 → 1.1.1.1:80` give two entries.
43. Multicast upper bound: a packet to `239.255.255.250.1900` → `[]`; a packet to `240.0.0.1.443` → one escape.
44. A line with a trailing `\r` or leading spaces is still parsed.
45. Invalid address tokens: a destination `172.30.0.300.443` from `172.30.0.5` is reported as
    `{ source: "172.30.0.5", destination: "172.30.0.300:443" }` (an address the parser cannot read is not proof of
    staying inside); a source `0172.30.0.5` or `172.30..5` is ignored (`[]`).
46. `pushSchema: true` changes only `migrate.command`: a fixture `app` with `command: ["node", "server.js"]` keeps it.
47. `capture.command` deep-equals `["tcpdump", "-i", "gato-egress", "-nn", "-l", "-tt", "ip"]`, and `sink.command`
    deep-equals `["sleep", "infinity"]`.

### The run (manual, recorded in the report)

35. A run whose capture misses the canary exits 1 with `"capture saw no canary attempt; refusing to report a clean result"`.
36. On this branch: `--storage local` and `--storage s3` exit 0 with `"no container tried to leave the network"`.
37. With a deliberate `await fetch("https://example.com")` in `src/app/api/healthcheck/route.ts` (local experiment, not
    committed), the run exits 1 with a line naming the `app` container and `example.com`.

## Mutations to kill

- packets to the subnet reported (subnet test inverted, mask arithmetic off by one);
- packets outside the subnet missed;
- the resolver rule dropped or widened to every port;
- the canary guard removed, or satisfied by another container's packet;
- the connection requirement applied when `routed` is false, or dropped when it is true;
- a service left on the default network, with `build`, with `ports`, or without `dns`;
- the input compose mutated.
