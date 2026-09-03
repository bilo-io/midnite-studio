import { validateWorkflow, type Workflow, type WorkflowNode } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuWorkflow } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { useFlushableSave } from '../councils/use-flushable-save';
import { NodeInspector } from './canvas/node-inspector';
import { WorkflowCanvas, type WorkflowGraph } from './canvas/workflow-canvas';
import { useRunWorkflow, useSaveWorkflow, useWorkflows } from './use-workflow';
import { WorkflowList } from './workflow-list';

/** Matches `council-config-panel.tsx`'s own auto-save debounce. */
const SAVE_DEBOUNCE_MS = 500;

/**
 * Workflows (Phase 43) — replaces the `<Placeholder>` `app.tsx` has rendered
 * for this `ViewId` since Phase 19. Global, like Councils: reachable with no
 * repository open, which is why `app.tsx` seats it ahead of the
 * `!selectedRepoId` guard.
 *
 * Plain selection state between the list and the open workflow's editor —
 * **not** `panel-stack`, even though Phase 42 has since landed it. The
 * phase doc's own resolved decision only offers that primitive to Theme G's
 * runs drawer; these two panes need no history, since the canvas is always
 * visible and there is nothing to go "back" from.
 */
export function WorkflowsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const workflows = useWorkflows();
  const selected = workflows.data?.find((workflow) => workflow.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-56 shrink-0 flex-col border-r border-border">
        <WorkflowList selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="min-h-0 flex-1">
        {selected ? (
          <WorkflowEditor key={selected.id} workflow={selected} />
        ) : (
          <EmptyState
            icon={LuWorkflow}
            title="Select a workflow"
            body="Pick one on the left, or create a new one to get started."
          />
        )}
      </div>
    </div>
  );
}

/**
 * One workflow's canvas plus its auto-save, in its own component keyed by
 * workflow id — so switching workflows unmounts the previous editor, and
 * `useFlushableSave`'s own unmount-flushes rather than dropping an edit made
 * just before the switch. A single save hook shared across every workflow
 * would have exactly that bug: its debounce holds one pending value, and a
 * second `schedule()` for a different workflow inside the same window would
 * silently overwrite the first's.
 *
 * **`local` is the canvas's real source of truth, not the `workflow` prop.**
 * The canvas has no state of its own — every edit calls `onChange` with the
 * next graph, computed from whatever graph it was last given. Feeding it the
 * `workflow` prop directly means two edits inside one `SAVE_DEBOUNCE_MS`
 * window — a drag immediately followed by adding a node, well within normal
 * use — would both compute their "next" from the same not-yet-round-tripped
 * prop, and the second `schedule()` call silently overwrites the first's
 * pending value with one that never knew about it. `local` closes that gap:
 * every `onChange` updates it immediately, so the next edit always builds on
 * the one before it, and `schedule` persists the same value in the
 * background. Seeded once per mount — `key={workflow.id}` on the caller
 * already remounts (and reseeds) this on a workflow switch.
 */
function WorkflowEditor({ workflow }: { workflow: Workflow }) {
  const save = useSaveWorkflow();
  const runWorkflow = useRunWorkflow();
  const { schedule } = useFlushableSave<Workflow>((next) => save.mutate(next), SAVE_DEBOUNCE_MS);
  const [local, setLocal] = useState(workflow);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());

  const issues = validateWorkflow(local);
  const invalidNodeIds = new Set(issues.map((issue) => issue.nodeId).filter((id): id is string => id !== undefined));
  const selectedNode =
    selection.size === 1 ? (local.nodes.find((node) => node.id === Array.from(selection)[0]) ?? null) : null;
  const selectedIssue = selectedNode ? issues.find((issue) => issue.nodeId === selectedNode.id) : undefined;

  const changeNode = (next: WorkflowNode) => {
    const updated = { ...local, nodes: local.nodes.map((node) => (node.id === next.id ? next : node)), updatedAt: Date.now() };
    setLocal(updated);
    schedule(updated);
  };

  return (
    <div className="flex h-full min-h-0">
      <WorkflowCanvas
        resetKey={workflow.id}
        graph={{ nodes: local.nodes, edges: local.edges }}
        onSelectionChange={setSelection}
        onChange={(next: WorkflowGraph) => {
          const updated = { ...local, ...next, updatedAt: Date.now() };
          setLocal(updated);
          schedule(updated);
        }}
        invalidNodeIds={invalidNodeIds}
        onRun={() => runWorkflow.mutate(local.id)}
        runDisabledReason={issues[0]?.message}
        isRunning={runWorkflow.isPending}
      />
      <NodeInspector
        node={selectedNode}
        nodes={local.nodes}
        edges={local.edges}
        issue={selectedIssue}
        onChange={changeNode}
      />
    </div>
  );
}
