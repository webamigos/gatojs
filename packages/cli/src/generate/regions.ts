export function replaceRegion(content: string, file: string, marker: string, body: string): string {
  const startToken = `wa:${marker}:start`;
  const endToken = `wa:${marker}:end`;
  const lines = content.split("\n");
  const starts = indicesOf(lines, startToken);
  const ends = indicesOf(lines, endToken);
  const [start] = starts;
  const [end] = ends;
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    start === undefined ||
    end === undefined ||
    end < start
  ) {
    throw new Error(`${file}: uszkodzony region wa:${marker}`);
  }
  const bodyLines = body === "" ? [] : body.split("\n");
  return [...lines.slice(0, start + 1), ...bodyLines, ...lines.slice(end)].join("\n");
}

function indicesOf(lines: string[], token: string): number[] {
  const found: number[] = [];
  lines.forEach((line, index) => {
    if (line.includes(token)) found.push(index);
  });
  return found;
}
