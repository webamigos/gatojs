import { createLogger } from "@gatojs/observability";
import { project } from "@/shared/config/project";

export const logger = createLogger(project.slug);
