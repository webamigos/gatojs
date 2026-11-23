export type PublishedPort = { service: string; variable: string | null; port: number };

export const FREE_PORT_SEARCH_LIMIT = 100;

export function publishedPorts(
  composeText: string,
  input: { profiles: string[]; env: Record<string, string | undefined> },
): PublishedPort[] {
  throw new Error(`not implemented: ${composeText.length} ${input.profiles.join()}`);
}

export async function suggestFreePort(
  port: number,
  isPortBusy: (port: number) => Promise<boolean>,
  taken: number[],
): Promise<number | null> {
  throw new Error(`not implemented: ${port} ${String(isPortBusy)} ${taken.join()}`);
}

export function portSettings(input: {
  busy: PublishedPort[];
  free: ReadonlyMap<number, number | null>;
  envText: string;
}): string[] {
  throw new Error(`not implemented: ${input.busy.length}`);
}

export function busyPortsReport(busy: PublishedPort[], settings: string[]): string[] {
  throw new Error(`not implemented: ${busy.length} ${settings.length}`);
}
