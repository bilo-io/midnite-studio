import { graphEngineeringDiamondTemplate } from './graph-engineering-diamond';
import { harnessBoundedBuildTemplate } from './harness-bounded-build';
import { loopMakerCheckerTemplate } from './loop-maker-checker';
import { researchAndPublishTemplate } from './research-and-publish';
import { riskRouterTemplate } from './risk-router';
import { WorkflowTemplateSchema, type WorkflowTemplate } from './types';

export * from './types';

/**
 * The built-in gallery (Phase 97 Theme L), in the order it shows. Each entry
 * is parsed at module load, so a malformed built-in fails loudly on import
 * rather than as a broken card in the gallery.
 */
export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  graphEngineeringDiamondTemplate,
  harnessBoundedBuildTemplate,
  loopMakerCheckerTemplate,
  researchAndPublishTemplate,
  riskRouterTemplate,
].map((template) => WorkflowTemplateSchema.parse(template));
