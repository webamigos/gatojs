const SEMVER_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type Version = { text: string; parts: [number, number, number] };

function parseTag(name: string): Version | null {
  const match = SEMVER_TAG_PATTERN.exec(name);
  if (!match) {
    return null;
  }
  return {
    text: name.slice(1),
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function isGreater(a: Version, b: Version): boolean {
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.parts[index] as number) - (b.parts[index] as number);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return false;
}

export function highestSemverTag(tagNames: string[]): string | null {
  let highest: Version | null = null;
  for (const name of tagNames) {
    const version = parseTag(name);
    if (version !== null && (highest === null || isGreater(version, highest))) {
      highest = version;
    }
  }
  return highest === null ? null : highest.text;
}
