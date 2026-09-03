import type { Workflow } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuWorkflow } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { useFlushableSave } from '../councils/use-flushable-save';
import { WorkflowCanvas, type WorkflowGraph } from './canvas/workflow-canvas';
import { useSaveWorkflow, useWorkflows } from './use-workflow';
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
 */
function WorkflowEditor({ workflow }: { workflow: Workflow }) {
  const save = useSaveWorkflow();
  const { schedule } = useFlushableSave<Workflow>((next) => save.mutate(next), SAVE_DEBOUNCE_MS);

  return (
    <WorkflowCanvas
      resetKey={workflow.id}
      graph={{ nodes: workflow.nodes, edges: workflow.edges }}
      onChange={(next: WorkflowGraph) => schedule({ ...workflow, ...next, updatedAt: Date.now() })}
    />
  );
}
