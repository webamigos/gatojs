export class ModuleAccessDeniedError extends Error {
  name = "ModuleAccessDeniedError";
  readonly moduleKey: string;

  constructor(moduleKey: string) {
    super(`Module access denied: ${moduleKey}`);
    this.moduleKey = moduleKey;
  }
}
