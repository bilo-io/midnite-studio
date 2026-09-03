import type { WorkflowEdge, WorkflowIssue, WorkflowNode, WorkflowNodeKind } from '@midnite/studio-shared';
import { ancestorIds } from '@midnite/studio-shared';
import { useState, type ReactNode } from 'react';
import { LuTriangleAlert } from 'react-icons/lu';

import { TextField } from '../../../components/form/field';
import { EmptyState } from '../../../components/empty-state';
import { declaredOutputFields } from './node-output-fields';
import { NODE_KIND_META } from './node-kind-meta';
import {
  ConditionForm,
  DelayForm,
  HttpForm,
  NoteForm,
  TransformForm,
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
};

type ActiveField = { value: string; onChange: (next: string) => void; el: HTMLElement };

/** `NodeFormProps.onInterpolatableFocus` only ever hands over an input/textarea. */
function asTextInput(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement {
  return el as HTMLInputElement | HTMLTextAreaElement;
}

/**
 * The right-hand config panel for the workflow canvas's selected node
 * (Phase 43 Theme F) — there is no right-hand config pane anywhere else in
 * this app, so this mirrors `council-config-panel.tsx`'s column markup with
 * `border-l` instead of `border-r`, placed after the canvas.
 *
 * Plain selection, not `panel-stack`: the phase doc's own recorded decision
 * reserves that primitive for Theme G's runs drawer, since this panel always
 * reflects the current selection rather than needing a "back".
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
      <div className="flex w-80 shrink-0 flex-col border-l border-border">
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
    <div className="flex w-80 shrink-0 flex-col border-l border-border">
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 py-2">
        <Form node={node} onChange={onChange} onInterpolatableFocus={setActiveField} />
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
