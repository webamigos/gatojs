const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

export function parseVersion(value: string): string {
  if (!VERSION_PATTERN.test(value)) {
    throw new Error(`Nieprawidłowa wersja: ${value}; podaj na przykład 0.2.0`);
  }
  return value;
}

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) {
    return Number(a) - Number(b);
  }
  if (aNumeric !== bNumeric) {
    return aNumeric ? -1 : 1;
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return b.length - a.length;
  }
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const result = compareIdentifiers(a[index], b[index]);
    if (result !== 0) {
      return result;
    }
  }
  return a.length - b.length;
}

function splitVersion(value: string): { core: number[]; prerelease: string[] } {
  const [core, ...rest] = value.split("-");
  const prerelease = rest.join("-");
  return {
    core: core.split(".").map(Number),
    prerelease: prerelease === "" ? [] : prerelease.split("."),
  };
}

export function compareVersions(a: string, b: string): number {
  const left = splitVersion(a);
  const right = splitVersion(b);
  for (let index = 0; index < 3; index++) {
    const result = left.core[index] - right.core[index];
    if (result !== 0) {
      return result;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}
