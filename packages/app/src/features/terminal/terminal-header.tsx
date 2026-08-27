import type { RepoDescriptor } from '@midnite/git-shared';
import { ChevronDown, ChevronUp, List, Plus, Terminal, X } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { StateDot } from '../../components/state-dot';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { splitHeaderPath } from './header-path';
import { resolveRepoForPath } from './resolve-repo-for-path';
import type { ConnectionState } from './terminal-store';

export type TerminalHeaderProps = {
  /** The active session's cwd, falling back to the selected worktree. */
  path: string | null;
  /** The active session's connection state; `idle` when nothing is open. */
  state: ConnectionState;
  repos: readonly RepoDescriptor[] | undefined;
  /** False while there is at most one session — the list toggle governs nothing. */
  listable: boolean;
  showList: boolean;
  maximized: boolean;
  onNewMenu: (event: React.MouseEvent<HTMLElement>) => void;
};

/**
 * The terminal panel's top strip.
 *
 * It used to read `Terminal  /Users/you/Dev/midnite-git` — a word that names
 * the pane you are already looking at, then a path with nothing to grab onto.
 * It now says the three things the pane cannot say for itself: that it is a
 * terminal (a glyph, in the width the word used to cost), whether the process
 * behind it is alive (the session list's own dot), and *where* it is — with the
 * checkout you navigate by picked out of the path around it.
 */
export function TerminalHeader({
  path,
  state,
  repos,
  listable,
  showList,
  maximized,
  onNewMenu,
}: TerminalHeaderProps) {
  return (
    /*
      Named for the e2e suite: the one thing that must be true of this strip is
      that nothing else in the window is ever drawn on top of it, and that is
      asserted by hit-testing across its width.
    */
    <div
      data-terminal-header
      className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1 text-xs text-muted-foreground"
    >
      <Terminal aria-hidden className="size-3.5 shrink-0" />
      <StateDot state={state} />
      <HeaderPath path={path} repos={repos} />

      {/* `ml-auto` and shrink-0: the path is the only thing that gives ground. */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <IconButton
          icon={List}
          label={showList ? 'Hide session list' : 'Show session list'}
          size="sm"
          aria-pressed={showList}
          {...(listable ? {} : { disabled: true, disabledReason: 'Only one session is open' })}
          onClick={() => useUiStore.getState().toggleTerminalList()}
        />
        <IconButton
          icon={Plus}
          label="New terminal or agent"
          size="sm"
          aria-expanded={false}
          onClick={onNewMenu}
        />
        <IconButton
          icon={maximized ? ChevronDown : ChevronUp}
          label={maximized ? 'Restore terminal height' : 'Expand terminal'}
          size="sm"
          aria-pressed={maximized}
          onClick={() => useUiStore.getState().toggleTerminalMaximized()}
        />
        <IconButton
          icon={X}
          label="Hide terminal"
          size="sm"
          onClick={() => useUiStore.getState().setTerminalOpen(false)}
        />
      </div>
    </div>
  );
}

/**
 * The path, in two spans: the ancestors, then the part you must not lose.
 *
 * That split is also how the row truncates from the LEFT. The header shares a
 * line with four buttons, so something has to give — and the default
 * right-truncation throws away the tail, which is the only informative end of a
 * path. Making the ancestor span absorb essentially all the shrinkage
 * (`[flex-shrink:9999]`) while the tail keeps a shrink factor of 1 puts the
 * ellipsis at the front with no bidi tricks and no measurement:
 * `…/.worktrees/theme-f/packages/app` rather than `/Users/you/Dev/midni…`.
 *
 * The tail is not `shrink-0`, and the container clips. A tail long enough to
 * fill the row on its own — a deep path under a long branch name — would
 * otherwise run under the button cluster and out past the panel's right edge,
 * since nothing above it in this row establishes a clipping box.
 */
function HeaderPath({
  path,
  repos,
}: {
  path: string | null;
  repos: readonly RepoDescriptor[] | undefined;
}) {
  if (!path) {
    return <span className="truncate italic">no worktree selected</span>;
  }

  const { head, tail, emphasised } = splitHeaderPath(
    path,
    bridge()?.homeDir,
    resolveRepoForPath(path, repos),
  );

  return (
    <span className="flex min-w-0 items-baseline overflow-hidden" title={path}>
      {/*
        Dimmed only when there is a tail to be dimmer THAN. Outside every known
        repository the path has no emphasised segment, and a uniformly
        half-transparent row would read as disabled rather than as plain.
      */}
      <span
        className={`min-w-0 truncate [flex-shrink:9999] ${emphasised ? 'text-muted-foreground/60' : ''}`}
      >
        {head}
      </span>
      <span className={`min-w-0 truncate ${emphasised ? 'font-medium text-foreground' : ''}`}>
        {tail}
      </span>
    </span>
  );
}
