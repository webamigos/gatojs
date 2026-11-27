import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANARY_ADDRESS,
  CANARY_HOST,
  findEscapes,
  verdict,
  type Escape,
} from "../capture.ts";

const SUBNET = "172.30.0.0/16";

describe("canary constants", () => {
  it("names the canary host and address from the plan", () => {
    assert.equal(CANARY_HOST, "egress-canary.invalid");
    assert.equal(CANARY_ADDRESS, "192.0.2.1");
  });
});

describe("findEscapes", () => {
  it("does not report a packet that stays inside the subnet", () => {
    assert.deepStrictEqual(
      findEscapes(
        ["12:00:00.000000 IP 172.30.0.5.41234 > 172.30.0.3.5432: Flags [S]"],
        SUBNET,
      ),
      [],
    );
  });

  it("reports a DNS lookup to an outside resolver with the queried name", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.41234 > 8.8.8.8.53: 1+ A? fonts.googleapis.com. (38)",
        ],
        SUBNET,
      ),
      [
        {
          source: "172.30.0.5",
          destination: "8.8.8.8:53",
          name: "fonts.googleapis.com",
        },
      ],
    );
  });

  it("reports a connection to an outside address without a name key", () => {
    assert.deepStrictEqual(
      findEscapes(
        ["12:00:00.000000 IP 172.30.0.5.41234 > 93.184.215.14.443: Flags [S]"],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "93.184.215.14:443" }],
    );
  });

  it("parses lines with epoch timestamps", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "1795738031.067217 IP 172.30.0.5.49322 > 93.184.215.14.443: Flags [S]",
        ],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "93.184.215.14:443" }],
    );
  });

  it("reports a lookup sent to the resolver inside the subnet", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "1795738031.067217 IP 172.30.0.2.49322 > 172.30.0.53.53: 25387+ AAAA? example.com. (39)",
        ],
        SUBNET,
        { resolver: "172.30.0.53" },
      ),
      [
        {
          source: "172.30.0.2",
          destination: "172.30.0.53:53",
          name: "example.com",
        },
      ],
    );
  });

  it("does not report a lookup to an in-subnet address when no resolver is given", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "1795738031.067217 IP 172.30.0.2.49322 > 172.30.0.53.53: 25387+ AAAA? example.com. (39)",
        ],
        SUBNET,
      ),
      [],
    );
  });

  it("does not report the resolver's ICMP unreachable reply", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "1795738031.067300 IP 172.30.0.53 > 172.30.0.2: ICMP 172.30.0.53 udp port 53 unreachable, length 75",
        ],
        SUBNET,
        { resolver: "172.30.0.53" },
      ),
      [],
    );
  });

  it("does not report a packet to the resolver address on a port other than 53", () => {
    assert.deepStrictEqual(
      findEscapes(
        ["1795738031.067217 IP 172.30.0.2.49322 > 172.30.0.53.80: Flags [S]"],
        SUBNET,
        {
          resolver: "172.30.0.53",
        },
      ),
      [],
    );
  });

  it("does not report a lookup on port 53 to an in-subnet address that is not the resolver", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "1795738031.067217 IP 172.30.0.2.49322 > 172.30.0.54.53: 7+ A? example.com. (29)",
        ],
        SUBNET,
        {
          resolver: "172.30.0.53",
        },
      ),
      [],
    );
  });

  it("does not report a packet whose source is outside the subnet", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 10.0.0.9.53 > 172.30.0.5.41234: 1 NXDomain 0/0/0 (38)",
        ],
        SUBNET,
      ),
      [],
    );
  });

  it("does not report multicast or broadcast packets", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.5353 > 224.0.0.251.5353: 0 [1q] PTR? _x._tcp.local. (40)",
          "12:00:00.000000 IP 172.30.0.5.68 > 255.255.255.255.67: BOOTP/DHCP",
        ],
        SUBNET,
      ),
      [],
    );
  });

  it("reports an ICMP packet to an outside address without a port", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5 > 192.0.2.1: ICMP echo request, id 1, seq 1, length 64",
        ],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "192.0.2.1" }],
    );
  });

  it("ignores lines that are not packets", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "listening on gato-egress, link-type EN10MB (Ethernet), snapshot length 262144 bytes",
          "",
          "tcpdump: verbose output suppressed, use -v[v]... for full protocol decode",
        ],
        SUBNET,
      ),
      [],
    );
  });

  it("collapses repeated packets and keeps the order of first appearance", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.40001 > 8.8.8.8.53: 1+ A? example.com. (29)",
          "12:00:00.000100 IP 172.30.0.5.41234 > 93.184.215.14.443: Flags [S]",
          "12:00:00.000200 IP 172.30.0.5.40002 > 8.8.8.8.53: 2+ AAAA? example.com. (29)",
          "12:00:01.000000 IP 172.30.0.5.41234 > 93.184.215.14.443: Flags [S]",
          "12:00:03.000000 IP 172.30.0.5.41235 > 93.184.215.14.443: Flags [S]",
        ],
        SUBNET,
      ),
      [
        {
          source: "172.30.0.5",
          destination: "8.8.8.8:53",
          name: "example.com",
        },
        { source: "172.30.0.5", destination: "93.184.215.14:443" },
      ],
    );
  });

  it("treats addresses just past a /16 as outside and its last host as inside", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.41234 > 172.31.0.1.443: Flags [S]",
          "12:00:00.000000 IP 172.30.0.5.41234 > 172.30.255.254.443: Flags [S]",
          "12:00:00.000000 IP 172.30.0.5.41234 > 172.29.255.254.443: Flags [S]",
        ],
        SUBNET,
      ),
      [
        { source: "172.30.0.5", destination: "172.31.0.1:443" },
        { source: "172.30.0.5", destination: "172.29.255.254:443" },
      ],
    );
  });

  it("treats addresses outside a /24 as outside and inside it as inside", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 10.1.2.5.41234 > 10.1.3.1.443: Flags [S]",
          "12:00:00.000000 IP 10.1.2.5.41234 > 10.1.2.200.443: Flags [S]",
        ],
        "10.1.2.0/24",
      ),
      [{ source: "10.1.2.5", destination: "10.1.3.1:443" }],
    );
  });

  it("does not treat a /24 source outside the subnet as a sender", () => {
    assert.deepStrictEqual(
      findEscapes(
        ["12:00:00.000000 IP 10.1.3.5.41234 > 93.184.215.14.443: Flags [S]"],
        "10.1.2.0/24",
      ),
      [],
    );
  });

  it("reports a TCP packet to port 53 without a query and without a name", () => {
    assert.deepStrictEqual(
      findEscapes(
        ["12:00:00.000000 IP 172.30.0.5.41234 > 8.8.8.8.53: Flags [S]"],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "8.8.8.8:53" }],
    );
  });

  it("does not take a name from a lookup-shaped payload on a port other than 53", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.41234 > 8.8.8.8.5353: 0 A? x.example. (30)",
        ],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "8.8.8.8:5353" }],
    );
  });

  it("keeps lookups of different names apart", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.40001 > 8.8.8.8.53: 1+ A? a.example. (27)",
          "12:00:00.000100 IP 172.30.0.5.40002 > 8.8.8.8.53: 2+ A? b.example. (27)",
        ],
        SUBNET,
      ),
      [
        { source: "172.30.0.5", destination: "8.8.8.8:53", name: "a.example" },
        { source: "172.30.0.5", destination: "8.8.8.8:53", name: "b.example" },
      ],
    );
  });

  it("keeps escapes apart whose source and destination only differ by where each ends", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.41234 > 11.1.1.1.80: Flags [S]",
          "12:00:00.000100 IP 172.30.0.51.41234 > 1.1.1.1.80: Flags [S]",
        ],
        SUBNET,
      ),
      [
        { source: "172.30.0.5", destination: "11.1.1.1:80" },
        { source: "172.30.0.51", destination: "1.1.1.1:80" },
      ],
    );
  });

  it("treats the top of the multicast range as multicast and the next address as an escape", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.41234 > 239.255.255.250.1900: UDP, length 120",
          "12:00:00.000100 IP 172.30.0.5.41234 > 240.0.0.1.443: Flags [S]",
        ],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "240.0.0.1:443" }],
    );
  });

  it("parses a line with a trailing carriage return", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 172.30.0.5.41234 > 93.184.215.14.443: Flags [S]\r",
        ],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "93.184.215.14:443" }],
    );
  });

  it("parses a line with leading spaces", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "   12:00:00.000000 IP 172.30.0.5.41234 > 8.8.8.8.53: 1+ A? a.example. (27)",
        ],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "8.8.8.8:53", name: "a.example" }],
    );
  });

  it("reports a destination address it cannot read instead of treating it as inside", () => {
    assert.deepStrictEqual(
      findEscapes(
        ["12:00:00.000000 IP 172.30.0.5.41234 > 172.30.0.300.443: Flags [S]"],
        SUBNET,
      ),
      [{ source: "172.30.0.5", destination: "172.30.0.300:443" }],
    );
  });

  it("ignores packets whose source address is not a valid address", () => {
    assert.deepStrictEqual(
      findEscapes(
        [
          "12:00:00.000000 IP 0172.30.0.5.41234 > 93.184.215.14.443: Flags [S]",
          "12:00:00.000100 IP 172.30..5.41234 > 93.184.215.14.443: Flags [S]",
        ],
        SUBNET,
      ),
      [],
    );
  });
});

describe("verdict", () => {
  const CLEAN = "no container tried to leave the network";
  const NO_CANARY =
    "capture saw no canary attempt; refusing to report a clean result";
  const holders = new Map<string, readonly string[]>([
    ["172.30.0.5", ["wa-egress-app-1"]],
    ["172.30.0.9", ["wa-egress-canary-1"]],
  ]);
  const lookup: Escape = {
    source: "172.30.0.9",
    destination: "172.30.0.53:53",
    name: "egress-canary.invalid",
  };
  const connection: Escape = {
    source: "172.30.0.9",
    destination: "192.0.2.1:80",
  };
  const context = (routed: boolean) => ({
    canary: "172.30.0.9",
    routed,
    holders,
  });

  it("is clean when a routed canary both looked up and connected", () => {
    assert.deepStrictEqual(verdict([lookup, connection], context(true)), {
      exitCode: 0,
      lines: [CLEAN],
    });
  });

  it("is clean with only the lookup when the canary has no route", () => {
    assert.deepStrictEqual(verdict([lookup], context(false)), {
      exitCode: 0,
      lines: [CLEAN],
    });
  });

  it("refuses a clean result when a routed canary's connection was not seen", () => {
    assert.deepStrictEqual(verdict([lookup], context(true)), {
      exitCode: 1,
      lines: [NO_CANARY],
    });
  });

  it("refuses a clean result when the canary's lookup was not seen", () => {
    assert.deepStrictEqual(verdict([connection], context(true)), {
      exitCode: 1,
      lines: [NO_CANARY],
    });
  });

  it("refuses a clean result when nothing was captured", () => {
    assert.deepStrictEqual(verdict([], context(false)), {
      exitCode: 1,
      lines: [NO_CANARY],
    });
  });

  it("does not count another container's canary-shaped lookup as the canary's", () => {
    const result = verdict(
      [{ ...lookup, source: "172.30.0.5" }],
      context(false),
    );
    assert.equal(result.exitCode, 1);
    assert.equal(result.lines[0], NO_CANARY);
  });

  it("does not count another container's connection to the canary address as the canary's", () => {
    const result = verdict(
      [lookup, { ...connection, source: "172.30.0.5" }],
      context(true),
    );
    assert.equal(result.exitCode, 1);
    assert.equal(result.lines[0], NO_CANARY);
  });

  it("reports a single offender with its container, name and destination", () => {
    assert.deepStrictEqual(
      verdict(
        [
          lookup,
          connection,
          {
            source: "172.30.0.5",
            destination: "172.30.0.53:53",
            name: "example.com",
          },
        ],
        context(true),
      ),
      {
        exitCode: 1,
        lines: [
          "1 attempt to leave the network:",
          "  wa-egress-app-1 (172.30.0.5) -> example.com (172.30.0.53:53)",
        ],
      },
    );
  });

  it("reports several offenders, including a nameless escape and an unknown source", () => {
    assert.deepStrictEqual(
      verdict(
        [
          lookup,
          { source: "172.30.0.5", destination: "93.184.215.14:443" },
          {
            source: "172.30.0.7",
            destination: "8.8.8.8:53",
            name: "a.example",
          },
        ],
        context(false),
      ),
      {
        exitCode: 1,
        lines: [
          "2 attempts to leave the network:",
          "  wa-egress-app-1 (172.30.0.5) -> 93.184.215.14:443",
          "  unknown container (172.30.0.7) -> a.example (8.8.8.8:53)",
        ],
      },
    );
  });

  it("joins several holders of one source address with or", () => {
    const sharedHolders = new Map<string, readonly string[]>([
      ["172.30.0.5", ["a-1", "b-1"]],
      ["172.30.0.9", ["wa-egress-canary-1"]],
    ]);
    assert.deepStrictEqual(
      verdict(
        [
          lookup,
          connection,
          { source: "172.30.0.5", destination: "93.184.215.14:443" },
        ],
        {
          canary: "172.30.0.9",
          routed: true,
          holders: sharedHolders,
        },
      ),
      {
        exitCode: 1,
        lines: [
          "1 attempt to leave the network:",
          "  a-1 or b-1 (172.30.0.5) -> 93.184.215.14:443",
        ],
      },
    );
  });

  it("puts the missing canary line before the offender lines", () => {
    assert.deepStrictEqual(
      verdict(
        [
          {
            source: "172.30.0.5",
            destination: "172.30.0.53:53",
            name: "example.com",
          },
        ],
        context(false),
      ),
      {
        exitCode: 1,
        lines: [
          NO_CANARY,
          "1 attempt to leave the network:",
          "  wa-egress-app-1 (172.30.0.5) -> example.com (172.30.0.53:53)",
        ],
      },
    );
  });
});
