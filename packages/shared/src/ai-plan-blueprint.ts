import { z } from 'zod';

/**
 * Plan with AI (Phase 95 Theme F) — the blueprint a fast, non-thinking model
 * proposes and the review sheet edits before anything reaches a forge.
 *
 * Deliberately its own module rather than folded into `ai-models.ts` (the
 * model registry) or `companion.ts` (a different headless-JSON caller with
 * its own reply shape): this is the one wire contract `main/ai/plan-blueprint.ts`
 * and the renderer's review sheet both parse, and it has nothing to do with
 * which model answered or how a command gets routed.
 *
 * **Task `key` is a local id, not a forge number.** Nothing has been created
 * yet — `key` only has to be unique within one blueprint, so edges can name a
 * task before it has a number, a body, or even survives the human edit pass.
 * `main/ai/plan-blueprint.ts` asks the model for short slugs (`"api"`,
 * `"tests"`) rather than letting it invent whatever it likes, but the schema
 * itself only requires non-empty and unique — the confirm sequencer
 * (`plan-confirm.ts`) is what maps a key to a real issue number once Confirm
 * creates it.
 */

const PLAN_TASK_KEY = z
  .string()
  .trim()
  .min(1, 'a task needs a key')
  .max(40);

export const AiPlanTaskSchema = z.object({
  key: PLAN_TASK_KEY,
  title: z.string().trim().min(1, 'a task needs a title').max(200),
  body: z.string().max(4000).default(''),
  labels: z.array(z.string().min(1).max(100)).max(20).default([]),
});
export type AiPlanTask = z.infer<typeof AiPlanTaskSchema>;

/**
 * The one edge kind Theme F writes — `blockedBy`, matching
 * `ForgeLinkKindSchema`'s own vocabulary (`domain/forge.ts`) exactly so the
 * confirm sequencer's `forge.issuesLink` call needs no translation. `from` is
 * the dependent task, `to` is its blocker — the identical convention
 * `ForgeGraphEdgeSchema`'s own docblock states for a real `'blocks'` edge, so
 * a blueprint edge and the graph edge it becomes read the same direction
 * throughout.
 */
export const AiPlanEdgeSchema = z.object({
  from: PLAN_TASK_KEY,
  to: PLAN_TASK_KEY,
  kind: z.literal('blockedBy'),
});
export type AiPlanEdge = z.infer<typeof AiPlanEdgeSchema>;

export const AiPlanProjectSchema = z.object({
  title: z.string().trim().min(1, 'a board needs a title').max(200),
  description: z.string().max(2000).default(''),
});
export type AiPlanProject = z.infer<typeof AiPlanProjectSchema>;

/**
 * The full blueprint. `superRefine` catches what the per-field schemas above
 * cannot: a duplicate task key (two tasks the sequencer could not tell apart)
 * and an edge naming a key no task declared — both are the model inventing a
 * reference rather than a shape violation, so they need the whole array in
 * view rather than one field's own check.
 */
export const AiPlanBlueprintSchema = z
  .object({
    project: AiPlanProjectSchema,
    tasks: z.array(AiPlanTaskSchema).min(1, 'a plan needs at least one task').max(30),
    edges: z.array(AiPlanEdgeSchema).max(200).default([]),
  })
  .superRefine((blueprint, ctx) => {
    const seen = new Set<string>();
    for (const task of blueprint.tasks) {
      if (seen.has(task.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate task key "${task.key}"`,
          path: ['tasks'],
        });
      }
      seen.add(task.key);
    }
    for (const edge of blueprint.edges) {
      if (!seen.has(edge.from) || !seen.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edge references a task key not in "tasks" (${edge.from} → ${edge.to})`,
          path: ['edges'],
        });
      }
      if (edge.from === edge.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `a task cannot block itself ("${edge.from}")`,
          path: ['edges'],
        });
      }
    }
  });
export type AiPlanBlueprint = z.infer<typeof AiPlanBlueprintSchema>;

/**
 * The first balanced `{…}` in `text`, string literals and escapes respected —
 * `companion.ts`'s `firstBalancedObject` in shape (a print-mode CLI answers
 * with JSON *plus* whatever prose it felt like adding around it) but not
 * imported from there: that helper is module-private to `companion.ts`, and a
 * second copy here is cheaper than exporting a general-purpose brace-walker
 * out of a file whose own doc is about the companion's reply, not this one's.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Pull a blueprint out of whatever the CLI actually printed.
 *
 * Tries a fenced code block first (a model asked for bare JSON commonly wraps
 * it in ` ```json ` anyway), then the raw text, and returns `null` on either
 * a JSON parse failure or a schema mismatch — `main/ai/plan-blueprint.ts` is
 * the caller that turns a `null` into its one retry, then an error envelope.
 * Pure, so the parsing is unit-testable without spawning anything, same as
 * `parseAskReply`.
 */
export function parsePlanBlueprintReply(stdout: string): AiPlanBlueprint | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(stdout);
  const candidates = [fenced?.[1], stdout].filter(
    (value): value is string => typeof value === 'string',
  );

  for (const candidate of candidates) {
    const found = firstBalancedObject(candidate);
    if (found === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(found);
    } catch {
      continue;
    }
    const parsed = AiPlanBlueprintSchema.safeParse(value);
    if (parsed.success) return parsed.data;
  }

  return null;
}
