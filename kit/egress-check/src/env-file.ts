const ASSIGNMENT = /^(?:#\s*)?([A-Za-z_][A-Za-z0-9_]*)=/;

export function fillEnv(
  example: string,
  values: Readonly<Record<string, string>>,
): string {
  const remaining = new Map(Object.entries(values));
  const lines = example.split("\n").map((line) => {
    const key = ASSIGNMENT.exec(line)?.[1];
    if (key === undefined || !remaining.has(key)) {
      return line;
    }
    const filled = `${key}=${remaining.get(key)}`;
    remaining.delete(key);
    return filled;
  });
  for (const [key, value] of remaining) {
    lines.push(`${key}=${value}`);
  }
  return lines.join("\n");
}
