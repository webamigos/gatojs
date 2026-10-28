export function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareModuleNames(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "core") return -1;
  if (b === "core") return 1;
  return compareCodePoint(a, b);
}
