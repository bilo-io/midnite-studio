import type { AgentDefinition, RepoDescriptor } from '@midnite/studio-shared';
import {
  LuChevronDown,
  LuChevronUp,
  LuList,
  LuPlus,
  LuTerminal,
  LuTriangleAlert,
  LuX,
} from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { resolveAgentIcon } from '../../components/icons';
import { StateDot } from '../../components/state-dot';
import { Tooltip } from '../../components/tooltip';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { splitHeaderPath } from './header-path';
import { resolveRepoForPath } from './resolve-repo-for-path';
import { useTerminalStore, type ConnectionState } from './terminal-store';

export type TerminalHeaderProps = {
  /** The active session's cwd, falling back to the selected worktree. */
  path: string | null;
  /** The active session's connection state; `idle` when nothing is open. */
  state: ConnectionState;
  /**
   * What is running in the active session right now, from main's process probe
   * — falling back to what the session was opened for, and absent for a plain
   * shell. Drives the leading glyph only; the path beside it is Theme D's.
   */
  agent: AgentDefinition | undefined;
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
 * It used to read `Terminal  /Users/you/Dev/midnite-studio` — a word that names
 * the pane you are already looking at, then a path with nothing to grab onto.
 * It now says the three things the pane cannot say for itself: that it is a
 * terminal (a glyph, in the width the word used to cost), whether the process
 * behind it is alive (the session list's own dot), and *where* it is — with the
 * checkout you navigate by picked out of the path around it.
 */
export function TerminalHeader({
  path,
  state,
  agent,
  repos,
  listable,
  showList,
  maximized,
  onNewMenu,
}: TerminalHeaderProps) {
  const broker = useTerminalStore((s) => s.broker);

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
      <HeaderMark agent={agent} />
      <StateDot state={state} />
      <HeaderPath path={path} repos={repos} />

      {broker.mode === 'inproc' && broker.reason ? (
        <Tooltip label={`Sessions will not survive quit — ${broker.reason}`}>
          <div className="flex items-center text-amber-500" tabIndex={0} role="status">
            <LuTriangleAlert className="h-3.5 w-3.5" />
          </div>
        </Tooltip>
      ) : null}

      {/* `ml-auto` and shrink-0: the path is the only thing that gives ground. */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <IconButton
          icon={LuList}
          label={showList ? 'Hide session list' : 'Show session list'}
          size="sm"
          aria-pressed={showList}
          {...(listable ? {} : { disabled: true, disabledReason: 'Only one session is open' })}
          onClick={() => useUiStore.getState().toggleTerminalList()}
        />
        <IconButton
          icon={LuPlus}
          label="New terminal or agent"
          size="sm"
          aria-expanded={false}
          onClick={onNewMenu}
        />
        <IconButton
          icon={maximized ? LuChevronDown : LuChevronUp}
          label={maximized ? 'Restore terminal height' : 'Expand terminal'}
          size="sm"
          aria-pressed={maximized}
          onClick={() => useUiStore.getState().toggleTerminalMaximized()}
        />
        <IconButton
          icon={LuX}
          label="Hide terminal"
          size="sm"
          onClick={() => useUiStore.getState().setTerminalOpen(false)}
        />
      </div>
    </div>
  );
}

/**
 * The glyph at the head of the strip: the agent running here, or a terminal.
 *
 * It follows the *live* answer, so quitting Claude Code inside an agent session
 * gives the header a terminal glyph back and typing `codex` into a plain shell
 * gives it Codex's mark. Together with the path beside it, the left of this row
 * names the current repository and the current agent rather than whichever menu
 * item happened to open the session.
 */
function HeaderMark({ agent }: { agent: AgentDefinition | undefined }) {
  if (!agent) return <LuTerminal aria-hidden className="size-3.5 shrink-0" />;

  const Icon = resolveAgentIcon(agent);
  return (
    <Icon
      aria-hidden
      className="size-3.5 shrink-0"
      // Inline for the same reason `SessionIcon` does it: a user-added agent's
      // accent is roster data, and Tailwind has never seen that colour.
      style={{ color: agent.accent }}
    />
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
