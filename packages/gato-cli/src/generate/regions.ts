export function replaceRegion(
  content: string,
  file: string,
  marker: string,
  body: string,
): string {
  const startToken = `wa:${marker}:start`;
  const endToken = `wa:${marker}:end`;
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const starts = indicesOf(lines, startToken);
  const ends = indicesOf(lines, endToken);
  const [start] = starts;
  const [end] = ends;
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    start === undefined ||
    end === undefined ||
    end <= start
  ) {
    throw new Error(`${file}: malformed region wa:${marker}`);
  }
  const bodyLines =
    body === ""
      ? []
      : body.split(/\r?\n/).map((line) => line.replace(/\r$/, ""));
  if (
    bodyLines.some(
      (line) => line.includes(startToken) || line.includes(endToken),
    )
  ) {
    throw new Error(
      `${file}: content of region wa:${marker} contains a region marker`,
    );
  }
  return [...lines.slice(0, start + 1), ...bodyLines, ...lines.slice(end)].join(
    eol,
  );
}

function indicesOf(lines: string[], token: string): number[] {
  const found: number[] = [];
  lines.forEach((line, index) => {
    if (line.includes(token)) {
      found.push(index);
    }
  });
  return found;
}
