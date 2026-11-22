import type { KitConfig } from "../kit/kit-config.js";
import type { ProjectNames } from "./project-names.js";

export function applyPlaceholders(
  file: string,
  content: string,
  config: KitConfig,
  names: ProjectNames,
): string {
  if (!config.placeholderFiles.includes(file)) {
    return content;
  }
  return content
    .replaceAll(config.placeholders.projectName, names.name)
    .replaceAll(config.placeholders.projectSlug, names.slug)
    .replaceAll(config.placeholders.projectSnake, names.snake);
}
