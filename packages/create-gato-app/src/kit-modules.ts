export type KitModule = { name: string; description: string; requires: string[] };

export function parseKitModule(raw: unknown, file: string): KitModule {
  throw new Error(`not implemented: ${String(raw)} ${file}`);
}

export async function readKitModules(kitDir: string): Promise<KitModule[]> {
  throw new Error(`not implemented: ${kitDir}`);
}

export function withRequired(selected: string[], modules: KitModule[]): string[] {
  throw new Error(`not implemented: ${selected.join()} ${modules.length}`);
}
