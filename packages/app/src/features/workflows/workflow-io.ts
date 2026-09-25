import {
  WORKFLOW_FRAME_DEFAULT_HEIGHT,
  WORKFLOW_FRAME_DEFAULT_WIDTH,
  WorkflowSchema,
  instantiateWorkflowTemplateWorkflow,
  type Workflow,
  type WorkflowNode,
  type WorkflowNodeKind,
  type WorkflowTemplate,
} from '@midnite/studio-shared';

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
    case 'agent':
      return { ...base, kind, label: 'Agent', config: { agentId: '', prompt: '' } };
    case 'script':
      return { ...base, kind, label: 'Script', config: { command: '', env: {} } };
    case 'join':
      return { ...base, kind, label: 'Join', config: { mode: 'all', inputs: 2 } };
    case 'gate':
      return { ...base, kind, label: 'Gate', config: { title: '', instructions: '', onTimeout: 'reject' } };
    case 'router':
      return { ...base, kind, label: 'Router', config: { mode: 'expression', cases: [] } };
    case 'verify':
      // `exit-code` is the check with no roster/parser dependency to pick
      // first — the plainest default a fresh node can run once a command is
      // filled in.
      return { ...base, kind, label: 'Verify', config: { check: 'exit-code', command: '', env: {} } };
    case 'trigger':
      return { ...base, kind, label: 'Trigger', config: { on: 'manual' } };
    case 'state':
      return { ...base, kind, label: 'State', config: { op: 'set', key: '', value: '' } };
    case 'frame':
      return {
        ...base,
        kind,
        label: 'THE AGENT HARNESS',
        config: {
          contract: '',
          context: '',
          state: '',
          tools: '',
          permissions: '',
          evidence: '',
          width: WORKFLOW_FRAME_DEFAULT_WIDTH,
          height: WORKFLOW_FRAME_DEFAULT_HEIGHT,
        },
      };
    case 'policy':
      return { ...base, kind, label: 'Policy', config: { allow: [], requireApprovalFor: [] } };
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
    nodes: workflow.nodes.map((node) => ({
      ...node,
      id: nodeIdMap.get(node.id) ?? node.id,
      // Phase 97 Theme I — a member's `frameId` must follow its frame's own
      // fresh id, or a clone/import would silently point every frame-member
      // node at a frame that no longer exists in the copy (a dangling
      // reference `validateWorkflow` would then flag on a workflow the user
      // never touched).
      ...(node.frameId !== undefined ? { frameId: nodeIdMap.get(node.frameId) ?? node.frameId } : {}),
    })),
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

/**
 * Phase 97 Theme L — a fresh, runnable workflow from a gallery template:
 * the template's three omitted fields filled in, then every node/edge id
 * re-minted through {@link cloneWorkflowWithFreshIds}, so one template used
 * twice never yields two workflows sharing node ids.
 */
export function workflowFromTemplate(template: WorkflowTemplate, now: number): Workflow {
  return cloneWorkflowWithFreshIds(instantiateWorkflowTemplateWorkflow(template, now), now, template.title);
}

/**
 * The editor's "Save as template" — the in-editor workflow as a **user**
 * template (its own `user-` id, so it can never collide with a built-in's
 * slug), rather than a clone in the ordinary workflow list.
 */
export function templateFromWorkflow(workflow: Workflow): WorkflowTemplate {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = workflow;
  return {
    id: `user-${crypto.randomUUID()}`,
    title: workflow.name,
    blurb: workflow.description ?? '',
    source: '',
    tags: [],
    workflow: rest,
  };
}
