import { WorkflowSchema, type Workflow, type WorkflowNode, type WorkflowNodeKind } from '@midnite/studio-shared';

/**
 * Pure workflow construction and JSON import/export helpers — testable
 * without mounting anything, the same argument `metric-path.ts` makes for its
 * own arithmetic.
 *
 * **No new IPC for import/export.** The phase doc imagined routing through
 * "the existing save dialog", but there isn't one: the only file dialog this
 * app exposes today (`repo-handlers.ts`) opens a folder, not a save-as file
 * picker. Adding a new main-process dialog channel for the cheapest possible
 * sharing story would be the tail wagging the dog, so export is a `Blob` +
 * a synthetic `<a download>` click and import is a plain `<input
 * type="file">` read with `FileReader` — both ordinary renderer-only DOM
 * APIs, no preload channel required.
 */

/**
 * A freshly-`crypto.randomUUID()`'d node for each of the MVP's five kinds,
 * with a config satisfying its schema's *output* shape — every field the
 * zod `.default()` would otherwise fill in on parse is supplied explicitly,
 * since a node built here is TypeScript-checked against `WorkflowNode`
 * itself rather than parsed. The node inspector (Theme F) is what lets a
 * user actually fill these in; this is only ever the empty starting point.
 *
 * A `switch` with no `default` arm, not a lookup table — so a sixth node
 * kind is a compile error here the moment `WORKFLOW_NODE_KINDS` grows,
 * exactly the guarantee the discriminated union exists to give.
 */
export function createNode(kind: WorkflowNodeKind, x: number, y: number): WorkflowNode {
  const base = { id: crypto.randomUUID(), x, y };
  switch (kind) {
    case 'http':
      return {
        ...base,
        kind,
        label: 'HTTP request',
        config: { method: 'GET', url: '', headers: {}, params: {}, queryShaped: false },
      };
    case 'transform':
      return { ...base, kind, label: 'Transform', config: { picks: [] } };
    case 'condition':
      return { ...base, kind, label: 'Condition', config: { left: '', op: 'eq', right: undefined } };
    case 'delay':
      return { ...base, kind, label: 'Delay', config: { ms: 1000 } };
    case 'note':
      return { ...base, kind, label: 'Note', config: { text: '' } };
  }
}

export function createEmptyWorkflow(now: number): Workflow {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled workflow',
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A copy with a fresh id for the workflow and for every node, edges remapped
 * to match. Shared by "Duplicate" and by importing a workflow exported from
 * this same app — the case a naive `JSON.parse` re-save would collide on,
 * since the file otherwise carries the exact ids it was exported with.
 */
export function cloneWorkflowWithFreshIds(workflow: Workflow, now: number, name?: string): Workflow {
  const nodeIdMap = new Map(workflow.nodes.map((node) => [node.id, crypto.randomUUID()]));
  return {
    ...workflow,
    id: crypto.randomUUID(),
    name: name ?? workflow.name,
    nodes: workflow.nodes.map((node) => ({ ...node, id: nodeIdMap.get(node.id) ?? node.id })),
    edges: workflow.edges.map((edge) => ({
      ...edge,
      id: crypto.randomUUID(),
      from: nodeIdMap.get(edge.from) ?? edge.from,
      to: nodeIdMap.get(edge.to) ?? edge.to,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function exportWorkflowFilename(workflow: Workflow): string {
  const slug = workflow.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'workflow'}.json`;
}

/** `WorkflowSchema.parse`'d so a malformed in-memory workflow cannot export. */
export function exportWorkflowJson(workflow: Workflow): string {
  return JSON.stringify(WorkflowSchema.parse(workflow), null, 2);
}

export type ImportWorkflowResult = { ok: true; workflow: Workflow } | { ok: false; error: string };

/**
 * Parses an imported file's text and assigns fresh ids throughout, so
 * importing the same export twice — or importing back into the app it came
 * from — produces two independent workflows rather than a silent id clash.
 */
export function parseImportedWorkflow(raw: string, now: number): ImportWorkflowResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }

  const result = WorkflowSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Not a valid workflow.' };
  }

  return { ok: true, workflow: cloneWorkflowWithFreshIds(result.data, now) };
}
