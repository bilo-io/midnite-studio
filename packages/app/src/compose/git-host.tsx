import { useCallback } from 'react';

import { runStatus, StatusGlyph } from '@midnite/studio-feature-forge/renderer';
import type { DragPayload, GitGraphActions, GitHost, GitPoint } from '@midnite/studio-frame';
import type { ForgeRun, GraphRow, Ref } from '@midnite/studio-shared';

import { useDialogs } from '../components/dialog-host';
import { resolveAgentIcon } from '../components/icons';
import { MultiSelectMenu } from '../components/multi-select-menu';
import { Tooltip } from '../components/tooltip';
import { useDismiss } from '../components/use-dismiss';
import { useOccluder } from '../components/use-occluder';
import { UserAvatar } from '../components/user-avatar';
import { evictKeptViewIfOverRows } from '../components/view-keep-alive';
import { ConflictResolutionStudio } from '../features/conflicts/conflict-resolution-studio';
import { useLineHighlight } from '../features/diff/line-highlight';
import { CiRunModal } from '../features/graph/ci-run-modal';
import { CommitInlinePanel, WorkingTreeInlinePanel } from '../features/graph/graph-inline-panels';
import { RefAgentAvatar } from '../features/graph/ref-agent-avatar';
import { useActiveAgentWorktreeSessions } from '../features/graph/use-agent-worktrees';
import { useGraphActions } from '../features/graph/use-graph-actions';
import { toggleRepoSection } from '../features/repos/view-sections';
import { StashInspector } from '../features/stash/stash-inspector';
import { ConflictBanner } from '../features/status/conflict-banner';
import { useAgents } from '../features/terminal/use-agents';
import { useCascadeReveal, useRevealCount } from '../lib/use-cascade-reveal';
import { keys, useRefs, useSessionHistory, useStashes } from '../services/queries';
import { useActiveWorktree, useStatus } from '../services/use-status';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Studio's implementation of the frame's git host port (Phase 113 Theme O): `ui-store` as the graph's
 * and diff's state (passed whole — `UiState` is a structural superset of `GitUiState`), Studio's query
 * hooks and keys (so the watcher's invalidation still reaches every graph and diff query), its own
 * chrome, and every Studio-only member — the write actions with their gates, the agent roster and
 * sessions, the working-copy and commit panels, the stash inspector and the conflict studio.
 *
 * Each member is what the moved views imported directly before the move, so Studio renders and
 * behaves exactly as it did.
 */

/**
 * The graph's write actions — `use-graph-actions.ts`'s menus and ops, unchanged (the write queue, the
 * blast-radius confirm and the force-push gate all live there), opened through Studio's dialog host.
 * One callback per member with the deps the view's own callbacks had, so the memoised rows re-render
 * exactly as often as before.
 */
function useStudioGraphActions(onError: (message: string) => void, refs: readonly Ref[]): GitGraphActions {
  const dialogs = useDialogs();
  const { commitMenu, refMenu, dropMenu, checkoutRef, report, syncFor, runSync, syncing } = useGraphActions(onError, refs);
  const openCommitMenu = useCallback(
    (point: GitPoint, row: GraphRow, currentBranch: string | null) => dialogs.openMenu(point, commitMenu(row, currentBranch)),
    [commitMenu, dialogs],
  );
  const openRefMenu = useCallback(
    (point: GitPoint, ref: Ref, currentBranch: string | null) => dialogs.openMenu(point, refMenu(ref, currentBranch)),
    [dialogs, refMenu],
  );
  const openDropMenu = useCallback(
    (point: GitPoint, source: DragPayload, target: Ref, currentBranch: string | null) =>
      dialogs.openMenu(point, dropMenu(source, target, currentBranch)),
    [dialogs, dropMenu],
  );
  const checkout = useCallback(
    (refName: string) => {
      void checkoutRef.mutateAsync({ target: refName }).then(report);
    },
    [checkoutRef, report],
  );
  return { openCommitMenu, openRefMenu, openDropMenu, checkout, syncFor, runSync, syncing };
}

/** The sidebar's own Stashes section, opened and unfolded — both folds independently hide it. */
function revealStashes(repoId: string): void {
  const ui = useUiStore.getState();
  if (!ui.reposOpen) ui.setReposOpen(true);
  if (ui.collapsedRepoSections[repoId]?.includes('stashes')) toggleRepoSection(repoId, 'stashes');
}

function RunGlyph({ run }: { run: ForgeRun }) {
  return <StatusGlyph status={runStatus(run)} />;
}

const useStudioAgents = () => useAgents().agents;
const useGraphVisible = () => useUiStore((s) => s.activeView === 'graph');

export const STUDIO_GIT_HOST: GitHost = {
  useUi: useUiStore,
  getUi: useUiStore.getState,
  useGraphVisible,
  panelBounds: {
    detailWidth: { ...LAYOUT_BOUNDS.detailWidth, initial: DEFAULT_LAYOUT.detailWidth },
    graphInlineHeight: { ...LAYOUT_BOUNDS.graphInlineHeight, initial: DEFAULT_LAYOUT.graphInlineHeight },
  },

  queryKeys: keys,
  useActiveWorktree,
  useStatus,
  useRefs,
  useStashes,
  revealStashes,

  useDismiss,
  useOccluder,
  useCascadeReveal,
  useRevealCount,
  resolveAgentIcon,
  useLineHighlight,
  ci: { runLabel: (run) => runStatus(run).label, RunGlyph },

  useActions: useStudioGraphActions,
  useAgents: useStudioAgents,
  useSessionHistory,
  useAgentWorktreeSessions: useActiveAgentWorktreeSessions,
  onHiddenRowCount: (rowCount) => evictKeptViewIfOverRows('graph', rowCount),

  Tooltip,
  MultiSelectMenu,
  UserAvatar,
  CommitPanel: CommitInlinePanel,
  WorkingTreePanel: WorkingTreeInlinePanel,
  ConflictBanner,
  StashInspector,
  ConflictStudio: ConflictResolutionStudio,
  CiRunModal,
  RefAgentAvatar,
};
