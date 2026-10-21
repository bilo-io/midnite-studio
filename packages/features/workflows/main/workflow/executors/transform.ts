import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate } from '../interpolate';

/**
 * The `transform` node: pick and rename fields out of upstream outputs into a
 * flat object of this node's own.
 *
 * Each `from` is the same dotted path `{{...}}` uses — so `fetch.body.items.0.id`
 * — and reuses `interpolate.ts` rather than a second path walker, which means a
 * `from` may also be a whole template (`"{{a.first}} {{a.last}}"`) and a
 * missing field is the same named failure it is everywhere else.
 *
 * **No JS evaluation.** That is a sandbox question, and opening it here would
 * drag a security review into a phase that otherwise has none.
 */
export const transformExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'transform') return { ok: false, error: 'Not a transform node.' };

  const output: Record<string, string> = {};
  for (const pick of node.config.picks) {
    // A bare path is wrapped rather than requiring the author to type braces
    // in a field whose entire purpose is to hold one reference.
    const template = pick.from.includes('{{') ? pick.from : `{{${pick.from}}}`;
    const result = interpolate(template, context.upstream);
    if (!result.ok) return { ok: false, error: result.error };
    output[pick.to] = result.value;
  }
  return { ok: true, output };
};
