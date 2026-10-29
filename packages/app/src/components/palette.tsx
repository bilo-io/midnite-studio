import { useCallback, useMemo } from 'react';

import { CommandPalette } from '@midnite/studio-frame';

import {
  useForgeIssues,
  useForgeProjects,
  useRepoFiles,
  useRepos,
  useRefs,
  useSwitchForgeAccount,
  useWorktrees,
} from '../services/queries';
import { useAgents } from '../features/terminal/use-agents';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { useUiStore } from '../store/ui-store';
import { useCommandHandlers } from '../services/keybindings/use-command-handlers';
import { useGitOp } from '../services/use-status';
import type { PaletteSource } from '../services/palette/source';
import {
  STUDIO_COMMAND_OPTIONS,
  createFilesSource,
  createForgeAccountsSource,
  createProjectBoardsSource,
  createRepoIssuesSource,
  createRefsSource,
  createReposSource,
  createTerminalSource,
  createViewsSource,
} from '../services/palette/providers';
import { usePaletteStore } from '../store/palette-store';
import { useDismiss } from './use-dismiss';

/**
 * The palette registers in Studio's dismissal stack: that is what makes it an occluder, so it can
 * never open UNDERNEATH a live browser tab's native view. A module function, so the frame calls the
 * same hook on every render.
 */
function usePaletteDismiss(active: boolean, onDismiss: () => void): void {
  useDismiss(active, onDismiss, { layer: 'dialog' });
}

/**
 * Studio's `Mod+K` palette: the frame's `CommandPalette` (Phase 123 Theme D) over Studio's runtime,
 * plus the repo-bound sources only Studio has — views, boards, issues, repos, refs, files, sessions
 * and forge accounts.
 */
export function Palette() {
  const mode = usePaletteStore((s) => s.mode);
  const close = usePaletteStore((s) => s.close);

  const runtime = useCommandHandlers();

  // Navigation data sources
  const reposQuery = useRepos();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const worktreesQuery = useWorktrees(selectedRepoId);
  const refsQuery = useRefs(selectedRepoId);
  // `enabled: false` — opening the palette must not itself fetch boards; this
  // reads whatever the Projects view has already cached, or nothing.
  const projectsQuery = useForgeProjects(selectedRepoId, false);
  // Same rule for the Repo issues source's list — Tasks' own key (50, `all`).
  const issuesQuery = useForgeIssues(selectedRepoId, false, 50, 'all');
  const { agents } = useAgents();
  const sessions = useTerminalStore((s) => s.sessions);
  // Phase 90 Theme L: "Switch to <login>" rows — the store mirror, so opening
  // the palette asks main for nothing.
  const forgeAccounts = useUiStore((s) => s.forgeAccounts);
  const forgeActiveAccountId = useUiStore((s) => s.forgeActiveAccountId);
  const { mutate: switchForgeAccount } = useSwitchForgeAccount();

  const repos = useMemo(() => reposQuery.data ?? [], [reposQuery.data]);
  const activeRepo = useMemo(
    () => repos.find((r) => r.id === selectedRepoId) ?? null,
    [repos, selectedRepoId],
  );
  const worktrees = useMemo(() => worktreesQuery.data ?? [], [worktreesQuery.data]);
  const refs = useMemo(() => refsQuery.data ?? [], [refsQuery.data]);
  const projectBoards = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data]);
  const repoIssues = useMemo(() => issuesQuery.data?.issues ?? [], [issuesQuery.data]);

  // Head/tip SHA of active worktree or main
  const tipSha = useMemo(() => {
    const headRef = refs.find((r) => r.isHead);
    return headRef?.sha ?? null;
  }, [refs]);

  const filesQuery = useRepoFiles(selectedRepoId, tipSha, selectedWorktreePath ?? undefined, {
    enabled: mode === 'all' || mode === 'files',
  });
  const files = useMemo(() => filesQuery.data?.files ?? [], [filesQuery.data]);
  const filesTruncated = filesQuery.data?.truncated ?? false;

  const checkoutOp = useGitOp<{ target: string; detach?: boolean }>('checkout', (api, args, ctx) =>
    api.ops.checkout({ ...ctx, target: args.target, detach: args.detach ?? false }),
  );

  const handleCheckout = useCallback(
    (ref: { name: string }) => {
      checkoutOp.mutate({ target: ref.name });
    },
    [checkoutOp],
  );

  const handleReveal = useCallback((ref: { sha: string }) => {
    useUiStore.getState().setActiveView('graph');
    useUiStore.getState().selectCommit(ref.sha);
  }, []);

  const sources = useMemo<PaletteSource[]>(() => {
    const list: PaletteSource[] = [];

    // The command rows are the frame's (Phase 123 Theme D); these follow them.

    // Views & Settings source
    if (mode === 'all' || mode === 'views') {
      list.push(createViewsSource(close));
      list.push(createProjectBoardsSource(projectBoards, selectedRepoId, close));
      list.push(createRepoIssuesSource(repoIssues, selectedRepoId, close));
    }

    // Repos & Worktrees source
    if (mode === 'all') {
      list.push(createReposSource(repos, worktrees, activeRepo?.id ?? null, close));
    }

    // Refs source (branches, tags)
    if ((mode === 'all' || mode === 'refs') && selectedRepoId) {
      list.push(createRefsSource(refs, close, handleCheckout, handleReveal));
    }

    // Files source
    if ((mode === 'all' || mode === 'files') && selectedRepoId) {
      list.push(createFilesSource(files, close));
    }

    // Sessions & Agents source
    if (mode === 'all') {
      list.push(createTerminalSource(sessions, agents, activeRepo, close));
    }

    // Forge accounts — alongside the commands, since a switch is an action.
    if (mode === 'all' || mode === 'commands') {
      list.push(
        createForgeAccountsSource(forgeAccounts, forgeActiveAccountId, switchForgeAccount, close),
      );
    }

    return list;
  }, [
    mode,
    close,
    repos,
    worktrees,
    activeRepo,
    selectedRepoId,
    projectBoards,
    repoIssues,
    refs,
    handleCheckout,
    handleReveal,
    files,
    sessions,
    agents,
    forgeAccounts,
    forgeActiveAccountId,
    switchForgeAccount,
  ]);

  return (
    <CommandPalette
      runtime={runtime}
      commandOptions={STUDIO_COMMAND_OPTIONS}
      sources={sources}
      useDismiss={usePaletteDismiss}
      footer={
        filesTruncated && (mode === 'all' || mode === 'files') ? (
          <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            Results capped at 20,000 files. Refine your search query.
          </div>
        ) : null
      }
    />
  );
}
