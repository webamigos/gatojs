---
title: 'From Docker 26 an internal network gives containers no default route and forwards no lookup outside it, so an egress capture sees nothing; point every service at a resolver address inside the network'
areas: ['ci', 'deploy']
topics: ['docker', 'compose', 'egress', 'dns', 'tcpdump', 'self-hosting']
---

# From Docker 26 an internal network gives containers no default route and forwards no lookup outside it, so an egress capture sees nothing; point every service at a resolver address inside the network

**In short**: on Docker 24 (Docker Desktop here) a container on an `internal: true` network still has a default route
through the bridge, and Docker's embedded DNS forwards a name it does not own from the container onto the bridge, so
tcpdump on the bridge sees every lookup and every connection attempt. On Docker 28 (`docker:28-dind`, the engine family
of GitHub's `ubuntu-latest`) the same container has no default route and the embedded DNS answers `SERVFAIL` without
sending anything, so the capture is empty and an egress check reads "clean". Give every service `dns: [<address inside
the subnet>]` held by a container that answers nothing: Docker 26.1.3 and later forward lookups to a resolver inside the
internal network, from the container's own address, on both engines.

**Context**: self-hosting Task 7 (`kit/egress-check`, [ADR-66](../adrs/66-the-app-calls-only-configured-endpoints-and-the-build-fetches-only-packages.md)),
2026-11-27. Ragen's appliance check was built and run on Docker 24 and mentions the change only as a possible cause of a
missed canary.

**Problem**:

- `docker run --network <internal> alpine ip route` prints `default via 172.31.250.1` on 24.0.2 and only the subnet route
  on 28.5.2.
- With `--dns 192.0.2.53` (an address outside the network) Docker 24 sends the lookup to it through the bridge; Docker 28
  sends nothing (the CVE-2024-29018 fix stops forwarding from internal networks to outside resolvers).
- With `--dns 172.31.250.53` (a container in the network) both engines send `A?`/`AAAA?` packets to it, and container
  names (`db`, `relay`) are still answered by the embedded DNS without a packet. A resolver that does not listen replies
  with ICMP port unreachable, so lookups fail at once instead of after the five-second resolver timeout.
- A connection to an outside address cannot be seen on Docker 28 at all: with no route, `connect()` fails in the
  container with `ENETUNREACH` and no packet exists. That is also proof the connection could not leave.

**Rule**: an egress capture on an internal network gives every service a `dns` address inside the network and treats
any packet to that address on port 53 as an attempt to leave. Its canary must be seen looking up a name; require the
canary's connection only when the canary has a default route (`ip route | grep -q '^default'`). Check new Docker
behaviour with a throwaway `docker:<version>-dind` container before trusting a local result for CI.

**Applies to**: `kit/egress-check/src/seal.ts` (`dns`, the `sink` service), `kit/egress-check/src/capture.ts`
(`findEscapes` with `resolver`, `verdict` with `routed`), and any future check that reads traffic on a Docker network.
