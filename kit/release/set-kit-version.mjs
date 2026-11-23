import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

function assertValidVersion(version) {
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new Error(`Invalid version: ${JSON.stringify(version)}`);
  }
}

function assertTopLevelVersion(kitJsonText) {
  const parsed = JSON.parse(kitJsonText);
  const isObject =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  if (!isObject || typeof parsed.version !== "string") {
    throw new Error("kit.json has no top-level version string");
  }
}

function stringEnd(text, start) {
  let index = start + 1;
  while (text[index] !== '"') {
    index += text[index] === "\\" ? 2 : 1;
  }
  return index;
}

function nextNonSpace(text, start) {
  let index = start;
  while (/\s/.test(text[index] ?? "")) {
    index += 1;
  }
  return index;
}

function topLevelVersionValueRange(kitJsonText) {
  let depth = 0;
  let index = 0;
  while (index < kitJsonText.length) {
    const char = kitJsonText[index];
    if (char === '"') {
      const end = stringEnd(kitJsonText, index);
      const colon = nextNonSpace(kitJsonText, end + 1);
      const isVersionKey =
        depth === 1 &&
        kitJsonText[colon] === ":" &&
        kitJsonText.slice(index, end + 1) === '"version"';
      if (isVersionKey) {
        const valueStart = nextNonSpace(kitJsonText, colon + 1);
        return [valueStart, stringEnd(kitJsonText, valueStart) + 1];
      }
      index = end + 1;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
    }
    index += 1;
  }
  throw new Error("kit.json has no top-level version string");
}

export function setKitVersion(kitJsonText, version) {
  assertValidVersion(version);
  assertTopLevelVersion(kitJsonText);
  const [start, end] = topLevelVersionValueRange(kitJsonText);
  return `${kitJsonText.slice(0, start)}"${version}"${kitJsonText.slice(end)}`;
}

function main([version, path = "kit/kit.json"]) {
  const file = resolve(process.cwd(), path);
  const updated = setKitVersion(readFileSync(file, "utf8"), version);
  writeFileSync(file, updated);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
