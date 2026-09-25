import type { WorkflowEdge, WorkflowFailurePolicy, WorkflowIssue, WorkflowNode, WorkflowNodeKind } from '@midnite/studio-shared';
import { ancestorIds } from '@midnite/studio-shared';
import { useState, type ReactNode } from 'react';
import { LuTriangleAlert } from 'react-icons/lu';

import { Field, TextField } from '../../../components/form/field';
import { SelectField } from '../../../components/form/select-field';
import { EmptyState } from '../../../components/empty-state';
import { declaredOutputFields } from './node-output-fields';
import { NODE_KIND_META } from './node-kind-meta';
import {
  AgentForm,
  ConditionForm,
  DelayForm,
  GateForm,
  HttpForm,
  JoinForm,
  NoteForm,
  RouterForm,
  ScriptForm,
  StateForm,
  TransformForm,
  TriggerForm,
  VerifyForm,
  type NodeFormProps,
} from './node-forms';

/**
 * One form per node kind, dispatched exhaustively — a sixth
 * `WorkflowNodeKind` is a typecheck failure here until its form exists,
 * which is the whole point of typing this as a `Record` rather than a
 * `switch` with a default nobody maintains.
 */
const NODE_FORMS: Record<WorkflowNodeKind, (props: NodeFormProps) => ReactNode> = {
  http: HttpForm,
  transform: TransformForm,
  condition: ConditionForm,
  delay: DelayForm,
  note: NoteForm,
  agent: AgentForm,
  script: ScriptForm,
  join: JoinForm,
  gate: GateForm,
  router: RouterForm,
  verify: VerifyForm,
  trigger: TriggerForm,
  state: StateForm,
};

type ActiveField = { value: string; onChange: (next: string) => void; el: HTMLElement };

/** `NodeFormProps.onInterpolatableFocus` only ever hands over an input/textarea. */
function asTextInput(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement {
  return el as HTMLInputElement | HTMLTextAreaElement;
}

const FAILURE_POLICY_LABEL: Record<WorkflowFailurePolicy['kind'], string> = {
  stop: 'Stop (default)',
  retry: 'Retry',
  fallback: 'Fall back to the error port',
  skip: 'Skip this step',
  repair: 'Repair — route to a step',
  escalate: 'Escalate — route to a gate',
};

/**
 * `onFailure` (Phase 97 Theme G) — every executor-bearing kind's own shared
 * base-schema field, so it lives here rather than in a per-kind `node-forms.tsx`
 * component: one editor, below whichever kind-specific form is showing, not
 * eleven copies of the same policy picker.
 */
function OnFailureSection({
  node,
  nodes,
  onChange,
}: {
  node: WorkflowNode;
  nodes: readonly WorkflowNode[];
  onChange: (next: WorkflowNode) => void;
}) {
  const policy = node.onFailure;
  const setPolicy = (next: WorkflowFailurePolicy | undefined) => onChange({ ...node, onFailure: next });
  const targets = nodes.filter((n) => n.id !== node.id && n.kind !== 'note');
  const gates = targets.filter((n) => n.kind === 'gate');

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On failure</p>
      <Field label="Policy" hint="What this step does if it fails or times out.">
        <SelectField
          label="On-failure policy"
          value={policy?.kind ?? 'stop'}
          onChange={(kind: WorkflowFailurePolicy['kind']) => {
            if (kind === 'stop') setPolicy(undefined);
            else if (kind === 'retry') setPolicy({ kind: 'retry', attempts: 3, backoffMs: 1000 });
            else if (kind === 'fallback') setPolicy({ kind: 'fallback' });
            else if (kind === 'skip') setPolicy({ kind: 'skip' });
            else if (kind === 'repair') setPolicy({ kind: 'repair', nodeId: targets[0]?.id ?? '' });
            else setPolicy({ kind: 'escalate', nodeId: gates[0]?.id ?? '' });
          }}
          options={(Object.keys(FAILURE_POLICY_LABEL) as WorkflowFailurePolicy['kind'][]).map((kind) => ({
            value: kind,
            label: FAILURE_POLICY_LABEL[kind],
          }))}
        />
      </Field>
      {policy?.kind === 'retry' ? (
        <>
          <Field label="Attempts" hint="Total tries, including the first — up to 10.">
            <TextField
              label="Attempts"
              value={String(policy.attempts)}
              onChange={(raw) => {
                const parsed = Number.parseInt(raw, 10);
                setPolicy({ ...policy, attempts: Number.isFinite(parsed) ? Math.max(1, Math.min(10, parsed)) : 1 });
              }}
            />
          </Field>
          <Field label="Backoff" hint="Fixed wait between attempts, in milliseconds — up to 60000.">
            <TextField
              label="Backoff (ms)"
              value={String(policy.backoffMs)}
              onChange={(raw) => {
                const parsed = Number.parseInt(raw, 10);
                setPolicy({ ...policy, backoffMs: Number.isFinite(parsed) ? Math.max(0, Math.min(60_000, parsed)) : 0 });
              }}
            />
          </Field>
        </>
      ) : null}
      {policy?.kind === 'repair' ? (
        <Field label="Repair step" hint="Receives this step's error as its input and becomes eligible to run.">
          {targets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No other step to repair to yet.</p>
          ) : (
            <SelectField
              label="Repair step"
              value={policy.nodeId}
              onChange={(nodeId: string) => setPolicy({ ...policy, nodeId })}
              options={targets.map((n) => ({ value: n.id, label: n.label }))}
            />
          )}
        </Field>
      ) : null}
      {policy?.kind === 'escalate' ? (
        <Field label="Escalate to" hint="Must be a gate step.">
          {gates.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No gate step to escalate to yet.</p>
          ) : (
            <SelectField
              label="Escalate to"
              value={policy.nodeId}
              onChange={(nodeId: string) => setPolicy({ ...policy, nodeId })}
              options={gates.map((n) => ({ value: n.id, label: n.label }))}
            />
          )}
        </Field>
      ) : null}
    </div>
  );
}

/**
 * The workflow canvas's selected-node config panel (Phase 43 Theme F) — the
 * base entry of `workflows-view.tsx`'s right-hand `panel-stack` (Phase 52
 * Theme F). Carries no width or border of its own: `workflows-view.tsx`'s
 * own wrapper owns those, matching `card-detail.tsx`'s identical convention
 * for the same reason (a panel-stack entry is content, not a column).
 */
export function NodeInspector({
  node,
  nodes,
  edges,
  issue,
  onChange,
}: {
  /** `null` when nothing (or more than one node) is selected. */
  node: WorkflowNode | null;
  nodes: readonly WorkflowNode[];
  edges: readonly WorkflowEdge[];
  /** The first validation issue naming this node, if any. */
  issue?: WorkflowIssue;
  onChange: (next: WorkflowNode) => void;
}) {
  const [activeField, setActiveField] = useState<ActiveField | null>(null);

  if (!node) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState title="No node selected" body="Select a node to configure it." />
      </div>
    );
  }

  const meta = NODE_KIND_META[node.kind];
  const Icon = meta.icon;
  const Form = NODE_FORMS[node.kind];

  const ancestors = ancestorIds(node.id, edges);
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const references = Array.from(ancestors)
    .map((id) => nodesById.get(id))
    .filter((n): n is WorkflowNode => n !== undefined)
    .flatMap((n) => declaredOutputFields(n).map((field) => ({ nodeId: n.id, nodeLabel: n.label, field })));

  const insertReference = (nodeId: string, field: string) => {
    if (!activeField) return;
    const snippet = `{{${nodeId}.${field}}}`;
    const { value, onChange: setValue } = activeField;
    const input = asTextInput(activeField.el);
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
    setValue(next);
    const caret = start + snippet.length;
    setActiveField({ ...activeField, value: next });
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <TextField
          label="Node label"
          value={node.label}
          onChange={(label) => onChange({ ...node, label })}
          className="min-w-0 flex-1 border-transparent bg-transparent px-0.5 text-xs font-medium focus:border-input focus:bg-background"
        />
      </div>

      {issue ? (
        <div className="flex shrink-0 items-start gap-1.5 border-b border-border bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          <LuTriangleAlert aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{issue.message}</span>
        </div>
      ) : null}

      <div className="hide-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 py-2">
        <Form node={node} onChange={onChange} onInterpolatableFocus={setActiveField} />
        {node.kind === 'note' ? null : <OnFailureSection node={node} nodes={nodes} onChange={onChange} />}
      </div>

      {activeField && references.length > 0 ? (
        <div className="shrink-0 border-t border-border px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Insert a reference
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {references.map((ref) => (
              <button
                key={`${ref.nodeId}.${ref.field}`}
                type="button"
                title={`${ref.nodeLabel} → ${ref.field}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertReference(ref.nodeId, ref.field)}
                className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
              >
                {`{{${ref.nodeId}.${ref.field}}}`}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
