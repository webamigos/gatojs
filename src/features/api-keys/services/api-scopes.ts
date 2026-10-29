import { modules } from "@/modules.generated";

type ScopeDeclaringModule = { apiScopes?: readonly { key: string }[] };

export function knownApiScopes(): string[] {
  const keys = (modules as readonly ScopeDeclaringModule[]).flatMap(
    (moduleDef) => moduleDef.apiScopes?.map((scope) => scope.key) ?? [],
  );
  return [...new Set(keys)];
}
