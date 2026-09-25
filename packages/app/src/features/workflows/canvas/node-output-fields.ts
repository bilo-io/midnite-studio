import type { WorkflowNode } from '@midnite/studio-shared';

/**
 * A node's output fields, when nothing has actually run yet.
 *
 * The node inspector's `{{...}}` helper (Phase 43 Theme F) prefers a real
 * run's recorded output when one exists — Theme G's concern, since that is
 * where run history is read — and falls back to this declared shape
 * otherwise, so the helper is useful on a workflow that has never run.
 *
 * `condition`, `delay` and `note` produce nothing worth naming: a condition
 * gates downstream nodes rather than emitting data, a delay's only effect is
 * time passing, and a note has no executor at all. `agent`/`script` (Theme J)
 * name what their executors actually record — the raw pty transcript and,
 * for a script node, its shell exit code.
 */
export function declaredOutputFields(node: WorkflowNode): string[] {
  switch (node.kind) {
    case 'http':
      return ['status', 'headers', 'body', 'durationMs'];
    case 'transform':
      return node.config.picks.map((pick) => pick.to);
    case 'condition':
    case 'delay':
    case 'note':
      return [];
    case 'agent':
      return ['output'];
    case 'script':
      return ['exitCode', 'output'];
    case 'join':
      if (node.config.mode === 'allSettled') return ['fulfilled', 'rejected'];
      if (node.config.mode === 'any') return ['result', 'from'];
      return ['results'];
    case 'gate':
      return ['decision', 'note', 'decidedBy'];
  }
}
