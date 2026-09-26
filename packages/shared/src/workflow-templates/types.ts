import { z } from 'zod';

import { WorkflowSchema, type Workflow } from '../workflow';

/**
 * A built-in or user-saved workflow template (Phase 97 Theme L) — a
 * `Workflow` minus the three fields a template has no business pinning
 * (`id`/`createdAt`/`updatedAt`, each minted fresh at instantiation), plus
 * gallery metadata. **Templates are data, never code** (the phase doc's own
 * words): every field here is either a plain string/array or a
 * `WorkflowSchema`-shaped object, nothing executable.
 *
 * Node/edge ids inside `workflow` are fixed strings, not
 * `crypto.randomUUID()`'d at module load — a template is deterministic data,
 * loaded once. `instantiateWorkflowTemplateWorkflow` below only fills in the
 * three omitted top-level fields; the app's own `cloneWorkflowWithFreshIds`
 * (`workflow-io.ts`, already exists) is what mints fresh per-node/edge ids on
 * top of that at "use this template" time — reusing that function, rather
 * than duplicating its id-remapping logic here, is what the phase doc means
 * by "Instantiation uses the existing `cloneWorkflowWithFreshIds`."
 */
export const WorkflowTemplateSchema = z.object({
  /** A stable slug, e.g. `'graph-engineering-diamond'` — never regenerated, so a user's own gallery pick (Phase 97 Theme L's "Your templates" section) can reference it across launches. */
  id: z.string().min(1),
  /** The gallery card's headline — deliberately not `workflow.name` twice over; a user template's title may differ from the workflow's own name if they rename one after the other. */
  title: z.string().min(1),
  /** One or two sentences for the gallery card. */
  blurb: z.string().default(''),
  /** A link (or a plain "Article — Section" reference for a built-in with no URL) to the article section this template demonstrates. Empty for a user-saved template, which has no source article. */
  source: z.string().default(''),
  tags: z.array(z.string()).default([]),
  /**
   * Shown once, on instantiation, for a template that needs something set up
   * before it runs *automatically* (a registered repo for a `forge-pr`
   * trigger, a forge account for a gate's `linkedRef`) — the plain manual
   * Run always works regardless, so this is guidance, never a block. Unset
   * (every template with nothing to configure) shows nothing.
   */
  setupChecklist: z.array(z.string().min(1)).optional(),
  workflow: WorkflowSchema.omit({ id: true, createdAt: true, updatedAt: true }),
});
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;

/**
 * Fills in the three fields {@link WorkflowTemplateSchema} omits, from
 * `template.workflow` as-is — node/edge ids untouched. The caller (the
 * gallery's "Use this template" action, `app`-side) is expected to pipe this
 * straight into `cloneWorkflowWithFreshIds(instantiateWorkflowTemplateWorkflow(template, now), now, template.title)`,
 * which is what actually remaps every node/edge id to a fresh one — this
 * function alone would hand back a workflow whose node ids collide with the
 * same template instantiated twice.
 */
export function instantiateWorkflowTemplateWorkflow(template: WorkflowTemplate, now: number): Workflow {
  return {
    ...template.workflow,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}
