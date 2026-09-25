import {
  isWorkflowEnabled,
  validateWorkflow,
  type Workflow,
  type WorkflowNode,
  type WorkflowNodeKind,
  type WorkflowNodeStatus,
} from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuWorkflow } from 'react-icons/lu';

import { useRegisterActivePanel } from '../../components/panel-stack/active-panel';
import { PanelHeader } from '../../components/panel-stack/panel-header';
import { PanelStack } from '../../components/panel-stack/panel-stack';
import { usePanelHistory } from '../../components/panel-stack/use-panel-history';
import { EmptyState } from '../../components/empty-state';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useWindowFocusGate } from '../../lib/use-window-focus-gate';
import { useToastStore } from '../../store/toast-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { useWorkflowRevealStore } from '../../store/workflow-reveal-store';
import { useWorkflowRunCommandStore, type WorkflowRunHandle } from '../../store/workflow-run-command-store';
import { useFlushableSave } from '../councils/use-flushable-save';
import { DemoApiOfferBanner } from './demo-api-offer-banner';
import { DemoApiPill } from './demo-api-pill';
import { NodeInspector } from './canvas/node-inspector';
import { NodePalette } from './canvas/node-palette';
import { RunNodeDetail } from './canvas/run-node-detail';
import { RunReplayControls } from './canvas/run-replay-controls';
import { nodeStatusesAtStep } from './canvas/run-replay';
import { WorkflowCanvas, type WorkflowGraph } from './canvas/workflow-canvas';
import { cloneWorkflowWithFreshIds, createNode } from './workflow-io';
import { RunHistoryList } from './run-history-list';
import { RunOutputPanel } from './run-output-panel';
import {
  useLiveWorkflowNodeSessions,
  useLiveWorkflowRun,
  useRunWorkflow,
  useWorkflowRun,
  useWorkflowRuns,
} from './use-workflow-run';
import { useSaveWorkflow, useWorkflows } from './use-workflow';
import { WorkflowList } from './workflow-list';
import { WorkflowToolbar } from './workflow-toolbar';

/**
 * The right-hand panel's own navigation (Phase 52 Theme F) — `NodeInspector`
 * is the base entry; picking "History" pushes the run list, and picking a
 * run from it pushes that run's node detail. `usePanelHistory`'s own
 * docblock has named Workflows as an obvious consumer since Phase 42 shipped
 * the primitive.
 */
type WorkflowPanelEntry = { kind: 'inspector' } | { kind: 'history' } | { kind: 'run'; runId: string };

function sameWorkflowPanelEntry(a: WorkflowPanelEntry, b: WorkflowPanelEntry): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'run' && b.kind === 'run' ? a.runId === b.runId : true;
}

function workflowPanelLabel(entry: WorkflowPanelEntry): string {
  switch (entry.kind) {
    case 'inspector':
      return 'Inspector';
    case 'history':
      return 'History';
    case 'run':
      return 'Run';
  }
}

/** Matches `council-config-panel.tsx`'s own auto-save debounce. */
const SAVE_DEBOUNCE_MS = 500;

/**
 * The collapsed node palette's own rendered width — matching
 * `board-view.tsx`'s `COLLAPSED_WIDTH` (`w-9`) rather than leaving the
 * wrapper's width unset. Both states need a real pixel value for
 * `transition-[width]` to animate between them at all: CSS cannot
 * interpolate to or from `auto`, which is what an unset width used to fall
 * back to.
 */
const WORKFLOW_PALETTE_COLLAPSED_WIDTH = 36;

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

  /**
   * "Reveal run in the Workflows view" (Theme J, the terminal accordion
   * group's own header button) — a pending request just needs the right
   * workflow selected; `WorkflowEditor` below (remounted via `key`) is what
   * actually opens that run's own history detail, once it exists to push
   * onto its own `panels` stack.
   */
  const revealPending = useWorkflowRevealStore((s) => s.pending);
  useEffect(() => {
    if (!revealPending) return;
    if (!workflows.data?.some((workflow) => workflow.id === revealPending.workflowId)) return;
    setSelectedId(revealPending.workflowId);
  }, [revealPending, workflows.data]);

  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const list = useResizable({
    size: layout.workflowListWidth,
    onSize: (value) => setLayout('workflowListWidth', value),
    initial: DEFAULT_LAYOUT.workflowListWidth,
    axis: 'x',
    edge: 'start',
    ...LAYOUT_BOUNDS.workflowListWidth,
  });

  return (
    <div className="flex h-full min-h-0">
      <div
        className="flex shrink-0 flex-col border-r border-border"
        style={{ width: list.current }}
      >
        <WorkflowList selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <ResizeHandle resizable={list} axis="x" label="Resize workflows list" />
      <div className="min-h-0 min-w-0 flex-1">
        {selected ? (
          <WorkflowEditor
            key={selected.id}
            workflow={selected}
            onWorkflowSaved={setSelectedId}
            initialRunId={revealPending?.workflowId === selected.id ? revealPending.runId : undefined}
          />
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
function WorkflowEditor({
  workflow,
  onWorkflowSaved,
  initialRunId,
}: {
  workflow: Workflow;
  /** "Save as template" (Theme I) lands a brand-new workflow — this is how the caller selects it. */
  onWorkflowSaved: (id: string) => void;
  /** "Reveal run" (Theme J) — opens straight onto this run's history detail on mount, once. */
  initialRunId?: string;
}) {
  const save = useSaveWorkflow();
  const runWorkflow = useRunWorkflow();
  const { schedule } = useFlushableSave<Workflow>((next) => save.mutate(next), SAVE_DEBOUNCE_MS);
  const [local, setLocal] = useState(workflow);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  // One instance per mount, not a module-level store (`card-panel-stack.tsx`'s
  // own reasoning) — `WorkflowEditor` is already remounted per workflow via
  // its caller's `key={workflow.id}`, which resets this stack for free on a
  // switch, the same way that remount already resets `local`/`selection`.
  const panels = usePanelHistory<WorkflowPanelEntry>({ kind: 'inspector' }, { isSame: sameWorkflowPanelEntry });
  useRegisterActivePanel(panels, true);

  // "Reveal run" (Theme J) — this component is already remounted per
  // workflow (`key={workflow.id}` on the caller), so `initialRunId` is
  // stable for this mount's whole life; push straight onto the run's own
  // history detail once, then consume the request so reopening the same
  // workflow later (without a fresh reveal) does not re-trigger it.
  useEffect(() => {
    if (!initialRunId) return;
    panels.push({ kind: 'history' });
    panels.push({ kind: 'run', runId: initialRunId });
    useWorkflowRevealStore.getState().consume();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount, deliberately not on every `panels` identity change
  }, [initialRunId]);

  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const paletteCollapsed = useUiStore((s) => s.workflowPaletteCollapsed);
  const setPaletteCollapsed = useUiStore((s) => s.setWorkflowPaletteCollapsed);
  const runPanelCollapsed = useUiStore((s) => s.workflowRunPanelCollapsed);
  const setRunPanelCollapsed = useUiStore((s) => s.setWorkflowRunPanelCollapsed);

  const detail = useResizable({
    size: layout.workflowDetailWidth,
    onSize: (value) => setLayout('workflowDetailWidth', value),
    initial: DEFAULT_LAYOUT.workflowDetailWidth,
    axis: 'x',
    edge: 'end',
    ...LAYOUT_BOUNDS.workflowDetailWidth,
  });
  const runPanel = useResizable({
    size: layout.workflowRunPanelHeight,
    onSize: (value) => setLayout('workflowRunPanelHeight', value),
    initial: DEFAULT_LAYOUT.workflowRunPanelHeight,
    axis: 'y',
    edge: 'end',
    ...LAYOUT_BOUNDS.workflowRunPanelHeight,
  });

  const runs = useWorkflowRuns(workflow.id);
  const activeRunId = panels.current.kind === 'run' ? panels.current.runId : null;
  const activeRun = useWorkflowRun(activeRunId);
  const mode: 'edit' | 'run' = panels.current.kind === 'run' ? 'run' : 'edit';

  /**
   * Step-through replay (Theme I's own checklist item, `run-replay.ts`) —
   * `null` means "the run's real final state", which is also what picking a
   * *different* run resets back to: a step position from the last run
   * viewed has nothing to do with this one's own node count.
   */
  const [replayStep, setReplayStep] = useState<number | null>(null);
  useEffect(() => setReplayStep(null), [activeRunId]);

  /**
   * The live `workflowRunChanged` payload (Phase 95 Theme I —
   * `use-workflow-run.ts`'s `useLiveWorkflowRun`), read straight off the IPC
   * event rather than waiting on `useWorkflowRuns`' invalidate-then-refetch
   * round trip. `null` once the run settles (its own last event already
   * carried the terminal status, but this hook clears on a workflow switch
   * only — a finished run's last-known state stays visible until history is
   * opened or a new run starts, matching `hasRunningRun`'s own read below).
   */
  const liveRun = useLiveWorkflowRun(workflow.id);
  // A pulsing history button costs a permanently-mounted animation the
  // instant a run is in flight — gated the way `BoardView`'s `agent-run-glow`
  // is, by calling the shared hook itself rather than waiting on a hoist:
  // `useWindowFocusGate` already supports concurrent hosts.
  const hasRunningRun = liveRun?.status === 'running' || (runs.data?.some((run) => run.status === 'running') ?? false);
  useWindowFocusGate(hasRunningRun);

  /**
   * "Live run state on the editing canvas" (Theme I) — the run whose node
   * statuses paint the canvas is the one being viewed in history (`mode ===
   * 'run'`), or, while editing, the live run event for this workflow (still
   * showing its last-known state after it settles, until a new run starts or
   * history is opened). Either way editing itself never locks: `readOnly`
   * below still keys only off `mode`, so a workflow keeps being editable
   * while its own run animates across it — the SVG canvas's Theme G
   * read-only mode was never about "can't edit during a run", only "this
   * pane is showing history, not the live graph".
   */
  const focusedRun = mode === 'run' ? (activeRun.data ?? null) : liveRun;

  const issues = validateWorkflow(local);
  const invalidNodeIds = new Set(issues.map((issue) => issue.nodeId).filter((id): id is string => id !== undefined));
  const selectedId = selection.size === 1 ? (Array.from(selection)[0] ?? null) : null;
  const selectedNode = selectedId ? (local.nodes.find((node) => node.id === selectedId) ?? null) : null;
  const selectedIssue = selectedNode ? issues.find((issue) => issue.nodeId === selectedNode.id) : undefined;
  const selectedRunNode = selectedId ? (activeRun.data?.nodes.find((n) => n.nodeId === selectedId) ?? null) : null;

  // In run mode with a step chosen, the replay's "as of step N" view wins
  // over the run's own final statuses — that is the whole point of a
  // scrubber. Editing mode (a live run painting the canvas, or nothing)
  // never has a `replayStep` to read: `RunReplayControls` only mounts in
  // the canvas toolbar for `mode === 'run'`.
  const runForReplay = mode === 'run' ? activeRun.data : undefined;
  const replayed = runForReplay && replayStep !== null ? nodeStatusesAtStep(runForReplay, replayStep) : null;

  const nodeStatuses = useMemo<ReadonlyMap<string, WorkflowNodeStatus> | undefined>(
    () => replayed?.statuses ?? (focusedRun ? new Map(focusedRun.nodes.map((n) => [n.nodeId, n.status])) : undefined),
    [replayed, focusedRun],
  );
  const nodeErrors = useMemo<ReadonlyMap<string, string> | undefined>(
    () =>
      replayed?.errors ??
      (focusedRun
        ? new Map(focusedRun.nodes.filter((n): n is typeof n & { error: string } => n.error !== undefined).map((n) => [n.nodeId, n.error]))
        : undefined),
    [replayed, focusedRun],
  );
  /**
   * Only the workflow's OWN currently-live run ever has a session to show
   * (Theme J) — a historical run being viewed in `mode === 'run'` has none:
   * its sessions have either ended (dropped their `workflowRunRef` on
   * archive) or are no longer running, so `nodeStatuses`/`nodeErrors` above
   * (which read `focusedRun`, live or historical) are what paints the canvas
   * while this is empty.
   */
  const nodeSessions = useLiveWorkflowNodeSessions(workflow.id);

  const commitLocal = (updated: Workflow) => {
    setLocal(updated);
    schedule(updated);
  };

  const changeNode = (next: WorkflowNode) => {
    commitLocal({ ...local, nodes: local.nodes.map((node) => (node.id === next.id ? next : node)), updatedAt: Date.now() });
  };

  const addNodeFromPalette = (kind: WorkflowNodeKind) => {
    // A simple cascade — each new node offset from the last so a run of
    // clicks (rather than drags, which the canvas positions at the drop
    // point) never stacks nodes exactly on top of one another.
    const offset = (local.nodes.length % 8) * 24;
    const node = createNode(kind, 80 + offset, 80 + offset);
    commitLocal({ ...local, nodes: [...local.nodes, node], updatedAt: Date.now() });
  };

  const saveAsTemplate = () => {
    const clone = cloneWorkflowWithFreshIds(local, Date.now(), `${local.name} (template)`);
    save.mutate(clone, {
      onSuccess: (result) => {
        if (result.ok) {
          useToastStore.getState().addToast({ message: `Saved "${clone.name}" as a new workflow.`, status: 'success' });
          onWorkflowSaved(clone.id);
        }
      },
    });
  };

  /**
   * The seam the global `workflow.run` command calls through — see
   * `workflow-run-command-store.ts`. A ref, not a dependency array, so this
   * effect registers once per mount rather than on every keystroke; the ref
   * always reads the current `local`/`issues`/`mode`, the same trick
   * `status-panel.tsx`'s `runRef` uses for `status.commit`.
   */
  const runRef = useRef<() => void>(() => {});
  runRef.current = () => {
    if (mode === 'edit' && issues.length === 0 && isWorkflowEnabled(local)) {
      runWorkflow.mutate(local.id);
      setRunPanelCollapsed(false);
    }
  };
  useEffect(() => {
    const handle: WorkflowRunHandle = { run: () => runRef.current() };
    useWorkflowRunCommandStore.getState().register(handle);
    return () => useWorkflowRunCommandStore.getState().unregister(handle);
  }, []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <WorkflowToolbar
        workflow={local}
        onRename={(name) => commitLocal({ ...local, name, updatedAt: Date.now() })}
        onDescriptionChange={(description) => commitLocal({ ...local, description, updatedAt: Date.now() })}
        enabled={isWorkflowEnabled(local)}
        onToggleEnabled={(on) => commitLocal({ ...local, enabled: on, updatedAt: Date.now() })}
        onOpenHistory={() => panels.push({ kind: 'history' })}
        hasRunningRun={hasRunningRun}
        onSaveAsTemplate={saveAsTemplate}
        saveState={save.isPending ? 'saving' : 'saved'}
        mode={mode}
        onBackToEditing={() => panels.reset()}
        onRun={mode === 'edit' ? () => runRef.current() : undefined}
        runDisabledReason={issues[0]?.message}
        isRunning={runWorkflow.isPending}
      />

      <div className="flex min-h-0 flex-1">
        <div
          className="shrink-0 overflow-hidden transition-[width] duration-150 ease-in-out"
          style={{ width: paletteCollapsed ? WORKFLOW_PALETTE_COLLAPSED_WIDTH : layout.workflowPaletteWidth }}
        >
          <NodePalette
            collapsed={paletteCollapsed}
            onToggleCollapsed={() => setPaletteCollapsed(!paletteCollapsed)}
            onAddNode={addNodeFromPalette}
            disabled={mode === 'run'}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {mode === 'edit' ? <DemoApiOfferBanner workflowId={workflow.id} nodes={local.nodes} /> : null}
          <div className="min-h-0 flex-1">
            <WorkflowCanvas
              resetKey={workflow.id}
              graph={{ nodes: local.nodes, edges: local.edges }}
              onSelectionChange={setSelection}
              onChange={
                mode === 'edit'
                  ? (next: WorkflowGraph) => commitLocal({ ...local, ...next, updatedAt: Date.now() })
                  : () => {}
              }
              invalidNodeIds={mode === 'edit' ? invalidNodeIds : undefined}
              nodeStatuses={nodeStatuses}
              nodeErrors={nodeErrors}
              nodeSessions={nodeSessions}
              readOnly={mode === 'run'}
              toolbarExtra={
                mode === 'edit' ? (
                  <DemoApiPill
                    selectedNode={selectedNode}
                    onInsertUrl={(baseUrl) => {
                      if (selectedNode?.kind === 'http') {
                        changeNode({ ...selectedNode, config: { ...selectedNode.config, url: baseUrl } });
                      }
                    }}
                  />
                ) : activeRun.data ? (
                  <RunReplayControls
                    run={activeRun.data}
                    step={replayStep ?? activeRun.data.nodes.length}
                    onStepChange={setReplayStep}
                  />
                ) : null
              }
            />
          </div>
          {runPanelCollapsed ? null : <ResizeHandle resizable={runPanel} axis="y" label="Resize run output panel" />}
          <RunOutputPanel
            run={focusedRun}
            collapsed={runPanelCollapsed}
            onToggleCollapsed={() => setRunPanelCollapsed(!runPanelCollapsed)}
            height={runPanel.current}
          />
        </div>

        <ResizeHandle resizable={detail} axis="x" label="Resize workflow detail" />
        <div
          className="flex h-full shrink-0 flex-col border-l border-border"
          style={{ width: detail.current }}
        >
        <PanelHeader
          history={panels}
          label={workflowPanelLabel}
          className="shrink-0 border-b border-border px-2 py-1.5"
        />
        <PanelStack
          history={panels}
          className="min-h-0 flex-1"
          render={(entry) => {
            switch (entry.kind) {
              case 'history':
                return (
                  <RunHistoryList
                    workflowId={workflow.id}
                    onSelectRun={(runId) => {
                      panels.push({ kind: 'run', runId });
                      setSelection(new Set());
                    }}
                  />
                );
              case 'run':
                return <RunNodeDetail node={selectedRunNode} />;
              case 'inspector':
                return (
                  <NodeInspector
                    node={selectedNode}
                    nodes={local.nodes}
                    edges={local.edges}
                    issue={selectedIssue}
                    onChange={changeNode}
                  />
                );
            }
          }}
        />
        </div>
      </div>
    </div>
  );
}
