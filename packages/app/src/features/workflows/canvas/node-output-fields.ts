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
    case 'router':
      return ['case', 'reason'];
    case 'verify':
      // `WorkflowVerifyEvidence`'s own field names (Theme E) — what
      // `{{verifyNodeId.path}}` can actually resolve, whichever check kind
      // produced it.
      return ['check', 'passed', 'failed', 'message', 'failures'];
    case 'trigger':
      // Manual and schedule fires carry nothing (the executor's own output is
      // `null`) — only a forge-pr fire hands downstream nodes real fields.
      return node.config.on === 'forge-pr' ? ['number', 'title', 'headRef', 'url', 'author'] : [];
    case 'state':
      return ['op', 'key', 'value'];
    case 'frame':
      // Canvas furniture with no executor — `validateWorkflow` refuses any
      // edge touching one, so nothing ever references this.
      return [];
    case 'policy':
      // Matches `policyExecutor`'s own pass-through output shape.
      return ['allow', 'requireApprovalFor'];
    // The palette kinds — each list is exactly what its executor
    // (`desktop/src/main/workflow/executors/`) records as `output`.
    case 'ai-prompt':
      return node.config.format === 'json' ? ['text', 'json', 'via'] : ['text', 'via'];
    case 'ai-extract':
      return node.config.fields.map((field) => field.key);
    case 'assert':
      return ['passed', 'left', 'op', 'right'];
    case 'fail':
      // Never succeeds — only its error port carries anything.
      return [];
    case 'command':
      return ['exitCode', 'stdout', 'stderr'];
    case 'read-file':
      return node.config.format === 'json' ? ['path', 'json', 'bytes'] : ['path', 'text', 'bytes'];
    case 'git-status':
      return ['branch', 'head', 'staged', 'unstaged', 'clean', 'path', 'repoId'];
    case 'forge-comment':
      return ['target', 'number'];
    case 'forge-issue':
      return ['number', 'url', 'title'];
    case 'set-fields':
      return Object.keys(node.config.fields);
    case 'json-extract':
      return ['value', 'found'];
    case 'coalesce':
      return ['value', 'index'];
    case 'notify':
      return ['title', 'body'];
    case 'write-file':
      return ['path', 'bytes', 'mode'];
    case 'clipboard':
      return ['length'];
  }
}
