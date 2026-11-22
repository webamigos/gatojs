const QUOTED = /^(["'])(.*)\1$/;

function unquote(value: string): string {
  const match = QUOTED.exec(value);
  return match ? match[2] : value;
}

export function parseDotenv(text: string): Record<string, string> {
  const entries = text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line !== "" && !line.startsWith("#") && line.includes("="),
    )
    .map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      return [key, unquote(value)] as const;
    });
  return Object.fromEntries(entries);
}
