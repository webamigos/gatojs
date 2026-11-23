// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkNodeVersion,
  dockerNodeMajors,
  findNodeLiterals,
  nodeMajor,
} from "../../../scripts/lib/architecture/node-version";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("nodeMajor", () => {
  it.each([
    ["v22.14.0\n", "22"],
    ["22\n", "22"],
    ["20.11", "20"],
    [" 22\n", "22"],
  ])("%j → %s", (nvmrc, major) => {
    expect(nodeMajor(nvmrc)).toBe(major);
  });
});

describe("dockerNodeMajors", () => {
  it("bierze major z każdej linii FROM node:<tag> i pomija FROM base", () => {
    expect(
      dockerNodeMajors(
        "FROM node:22-alpine AS base\nRUN x\nFROM base AS deps\nfrom node:20.11-slim AS tools\nFROM --platform=linux/amd64 node:18 AS cross\n",
      ),
    ).toEqual(["22", "20", "18"]);
  });

  it("dopuszcza wiele spacji wokół FROM i --platform, ale tylko FROM na początku linii", () => {
    expect(
      dockerNodeMajors(
        "  FROM  --platform=linux/amd64  node:20 AS a\nRUN echo FROM node:18\n",
      ),
    ).toEqual(["20"]);
  });

  it.each(["FROM node:lts-alpine\n", "FROM node:alpine3.20\n"])(
    "tag bez numeru na początku daje pusty major: %j",
    (dockerfile) => {
      expect(dockerNodeMajors(dockerfile)).toEqual([""]);
    },
  );

  it("Dockerfile bez FROM node: daje pustą listę", () => {
    expect(dockerNodeMajors("FROM debian:12\nFROM base AS x\n")).toEqual([]);
  });
});

describe("findNodeLiterals", () => {
  it("node-version z literałem to naruszenie", () => {
    expect(findNodeLiterals("with:\n  node-version: 22\n")).toEqual([
      "node-version: 22",
    ]);
  });

  it("node-version-file nie jest naruszeniem", () => {
    expect(findNodeLiterals("node-version-file: .nvmrc")).toEqual([]);
  });

  it("node-version-file obok literału w tym samym pliku nie jest liczony", () => {
    expect(
      findNodeLiterals(
        "steps:\n  - uses: actions/setup-node@v4\n    with:\n      node-version-file: .nvmrc\n  - uses: actions/setup-node@v4\n    with:\n      node-version: '20.x'\n",
      ),
    ).toEqual(["node-version: '20.x'"]);
  });

  it("zgłasza każde wystąpienie literału", () => {
    expect(
      findNodeLiterals("    node-version: 22\n    node-version: 20\n"),
    ).toEqual(["node-version: 22", "node-version: 20"]);
  });

  it("zakomentowany node-version nie jest naruszeniem", () => {
    expect(findNodeLiterals("      # node-version: 22\n")).toEqual([]);
  });

  it("node-version jako element listy YAML to naruszenie", () => {
    expect(findNodeLiterals("  -   node-version: 22\n")).toEqual([
      "node-version: 22",
    ]);
  });

  it("node-version bez spacji po dwukropku to naruszenie", () => {
    expect(findNodeLiterals("node-version:22\n")).toEqual(["node-version:22"]);
  });

  it("workflow bez setup-node nie ma naruszeń", () => {
    expect(
      findNodeLiterals("jobs:\n  a:\n    runs-on: ubuntu-latest\n"),
    ).toEqual([]);
  });
});

describe("checkNodeVersion", () => {
  let root: string;

  const write = (relative: string, content: string) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
    write(".nvmrc", "22\n");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("zgodne wersje i workflow z node-version-file przechodzą", () => {
    write("Dockerfile", "FROM node:22-alpine AS base\nFROM base AS runner\n");
    write(".github/workflows/ci.yml", "with:\n  node-version-file: .nvmrc\n");
    expect(checkNodeVersion(root)).toEqual([]);
  });

  it("brak katalogu workflows nie jest naruszeniem", () => {
    write("Dockerfile", "FROM node:22-alpine\n");
    expect(checkNodeVersion(root)).toEqual([]);
  });

  it("zgłasza Dockerfile z innym majorem niż .nvmrc", () => {
    write("Dockerfile", "FROM node:20-alpine AS base\n");
    expect(checkNodeVersion(root)).toEqual([
      "Dockerfile: node:20-alpine, .nvmrc: 22",
    ]);
  });

  it("v22.14.0 w .nvmrc zgadza się z node:22", () => {
    write(".nvmrc", "v22.14.0\n");
    write("Dockerfile", "FROM node:22-alpine\n");
    expect(checkNodeVersion(root)).toEqual([]);
  });

  it("zgłasza Dockerfile bez FROM node:", () => {
    write("Dockerfile", "FROM debian:12\n");
    expect(checkNodeVersion(root)).toEqual([
      "Dockerfile: no FROM node:<version>",
    ]);
  });

  it("zgłasza literał node-version w workflow .yml", () => {
    write("Dockerfile", "FROM node:22-alpine\n");
    write(".github/workflows/ci.yml", "with:\n  node-version: 22\n");
    expect(checkNodeVersion(root)).toEqual([
      ".github/workflows/ci.yml: node-version: 22",
    ]);
  });

  it("nie czyta docker-compose.yml ani plików workflow z innym rozszerzeniem", () => {
    write(".nvmrc", "22");
    write("Dockerfile", "FROM node:22");
    write("docker-compose.yml", "x:\n  node-version: 22\n");
    write(".github/workflows/old.yml.bak", "node-version: 22\n");
    expect(checkNodeVersion(root)).toEqual([]);
  });

  it("czyta też workflow .yaml", () => {
    write("Dockerfile", "FROM node:22-alpine\n");
    write(".github/workflows/e2e.yaml", "with:\n  node-version: 22\n");
    expect(checkNodeVersion(root)).toEqual([
      ".github/workflows/e2e.yaml: node-version: 22",
    ]);
  });
});

describe("repo", () => {
  it("ma jedną wersję Node w .nvmrc, Dockerfile i workflow", () => {
    expect(checkNodeVersion(repoRoot)).toEqual([]);
  });
});
