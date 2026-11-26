export class ModuleDisabledError extends Error {
  name = "ModuleDisabledError";
  readonly moduleKey: string;

  constructor(moduleKey: string) {
    super(`Module disabled: ${moduleKey}`);
    this.moduleKey = moduleKey;
  }
}
