import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, type ComponentProps } from 'react';
import { LuBot } from 'react-icons/lu';

import { forgeKeys, runStatus, StatusGlyph } from '@midnite/studio-feature-forge/renderer';
import { bridge, RingSpinner, type GitHost } from '@midnite/studio-frame';
import type { ForgeRun, Ref, StatusResult } from '@midnite/studio-shared';

import { useCoderStore } from '../coder-store';
import { CoderMultiSelect, CoderTooltip, CoderUserAvatar, useCoderDismiss } from './git-chrome';
import { coderGitStore, PANEL_BOUNDS, useCoderGitUi } from './git-store';

/**
 * Coder's side of the frame's git host port (Phase 113 Theme O slice 2) — a READ-ONLY graph.
 *
 * The required members only, plus the CI glyph (Coder composes the forge, so the CI column works):
 * Coder's own store for the graph's state, react-query over its bridge's read-only `repos.refs` /
 * `status.get` (main runs the system git, `main/git.ts`), small chrome, and a commit panel built on
 * the frame's diff view. Deliberately absent: `useActions` (no write op — no menus, drag-to-merge,
 * checkout or sync), the agent roster and sessions, the working-copy panel, stashes and the conflict
 * studio. Each is a control the graph leaves out rather than one that does nothing.
 */

const useActiveWorktree = () => ({ repoId: useCoderGitUi((s) => s.selectedRepoId) });

function useRefs(repoId: string | null) {
  return useQuery<Ref[]>({
    queryKey: ['repos', repoId ?? '', 'refs'],
    queryFn: async () => (repoId ? ((await bridge()?.repos.refs({ repoId })) ?? []) : []),
    enabled: repoId !== null,
  });
}

function useStatus() {
  const { repoId } = useActiveWorktree();
  return useQuery<StatusResult | undefined>({
    queryKey: ['repos', repoId ?? '', 'status', 'main'],
    queryFn: async () => (repoId ? await bridge()?.status.get({ repoId }) : undefined),
    enabled: repoId !== null,
  });
}

/** Its own chunk, like the graph: the diff view loads the first time a commit is opened. */
const LazyCommitPanel = lazy(() => import('./commit-panel').then((m) => ({ default: m.CoderCommitPanel })));

function CommitPanel(props: ComponentProps<GitHost['CommitPanel']>) {
  return (
    <Suspense fallback={<RingSpinner label="Loading commit" size="sm" />}>
      <LazyCommitPanel repoId={props.repoId} sha={props.sha} onClose={props.onClose} />
    </Suspense>
  );
}

function RunGlyph({ run }: { run: ForgeRun }) {
  return <StatusGlyph status={runStatus(run)} />;
}

const NO_CASCADE = { active: false, styleFor: () => ({}) };

export const CODER_GIT_HOST: GitHost = {
  useUi: useCoderGitUi,
  getUi: coderGitStore.getState,
  useGraphVisible: () => useCoderStore((s) => s.view === 'graph'),
  panelBounds: PANEL_BOUNDS,

  queryKeys: {
    diff: (repoId, worktreePath, path, staged, context) => ['repos', repoId, 'status', worktreePath ?? 'main', 'diff', path, staged, context],
    commitDiff: (repoId, sha, path, context) => ['repos', repoId, 'commit-diff', sha, path, context],
    stashDiff: (repoId, selector, part, path, context) => ['repos', repoId, 'stash', selector, part, path, context],
    commitStats: (repoId, shas) => ['commit-stats', repoId, shas],
    forgeCommitRuns: forgeKeys.forgeCommitRuns,
  },
  useActiveWorktree,
  useStatus,
  useRefs,

  useDismiss: useCoderDismiss,
  useCascadeReveal: () => NO_CASCADE,
  useRevealCount: () => 0,
  resolveAgentIcon: () => LuBot,
  ci: { runLabel: (run) => runStatus(run).label, RunGlyph },

  Tooltip: CoderTooltip,
  MultiSelectMenu: CoderMultiSelect,
  UserAvatar: CoderUserAvatar,
  CommitPanel,
};
