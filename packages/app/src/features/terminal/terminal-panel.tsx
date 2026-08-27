import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/git-shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, List, Plus, X } from 'lucide-react';
import { useEffect } from 'react';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import type { MenuItem } from '../../components/context-menu';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { bridge, hasBridge } from '../../services/bridge';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { TerminalSessionList } from './terminal-session-list';
import { useTerminalStore } from './terminal-store';
import { TerminalView } from './terminal-view';

/**
 * The terminal pane: chrome, the session list, and every session's xterm.
 *
 * Every open session is mounted at once and stacked; only the active one is
 * visible. That is what lets a build keep running in one terminal while you
 * work in another, and it is a deliberate reversal of Phase 9's
 * unmount-when-hidden rule — which existed because a hidden shell had no UI to
 * see or stop it. The session list is that UI.
 */
export function TerminalPanel({ cwd, repoId, repoName }: TerminalPanelProps) {
  const dialogs = useDialogs();
  const sessions = useTerminalStore((s) => s.sessions);
  const activeId = useTerminalStore((s) => s.activeId);
  const hydrated = useTerminalStore((s) => s.hydrated);
  const pendingInput = useTerminalStore((s) => s.pendingInput);
  const maximized = useUiStore((s) => s.terminalMaximized);
  const side = useUiStore((s) => s.terminalSidebarSide);
  const listOpen = useUiStore((s) => s.terminalListOpen);
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const agents = useAgents();

  /*
    The list sits left of the handle in DOM order regardless of dock side —
    `flex-row-reverse` is what actually moves it to the right visually. Docked
    right, the handle ends up to the list's LEFT on screen, so dragging it
    left has to grow the list: the same inversion the terminal's own height
    handle needs against the panel above it.
  */
  const list = useResizable({
    size: layout.terminalListWidth,
    onSize: (value) => setLayout('terminalListWidth', value),
    initial: DEFAULT_LAYOUT.terminalListWidth,
    axis: 'x',
    edge: side === 'left' ? 'start' : 'end',
    ...LAYOUT_BOUNDS.terminalListWidth,
  });

  // Restore saved sessions once, on first mount. Spawns nothing.
  useEffect(() => {
    void useTerminalStore.getState().hydrate();
  }, []);

  /**
   * Open the first terminal automatically.
   *
   * Only when nothing was restored: with saved sessions the user already has
   * terminals, and adding an unasked-for one on every launch would grow the
   * list forever.
   */
  useEffect(() => {
    if (!hydrated || sessions.length > 0 || !cwd || !repoId) return;
    useTerminalStore.getState().openSession({ kind: 'shell', title: repoName, cwd, repoId });
  }, [hydrated, sessions.length, cwd, repoId, repoName]);

  const openNew = (agent?: AgentDefinition) => {
    if (!cwd || !repoId) return;
    useTerminalStore.getState().openSession({
      kind: agent ? 'agent' : 'shell',
      ...(agent ? { agentId: agent.id } : {}),
      title: repoName,
      cwd,
      repoId,
    });
  };

  /**
   * The `+` menu, anchored under the button.
   *
   * `useDialogs().openMenu` takes a point, so the button's own rect supplies
   * one — there is no generic dropdown in the app, and the context menu is
   * already the thing that knows how to stay on screen and close on Escape.
   */
  const showNewMenu = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const items: MenuItem[] = [
      {
        label: 'New Terminal',
        onSelect: () => openNew(),
        ...(cwd ? {} : { disabled: true, disabledReason: 'No worktree selected' }),
      },
      ...(agents.length > 0 ? [{ type: 'separator' as const }] : []),
      ...agents.map((agent) => ({
        label: `New Agent — ${agent.label}`,
        onSelect: () => openNew(agent),
        ...(cwd ? {} : { disabled: true, disabledReason: 'No worktree selected' }),
      })),
    ];
    dialogs.openMenu({ clientX: rect.left, clientY: rect.bottom }, items);
  };

  const active = sessions.find((s) => s.id === activeId) ?? null;
  /*
    A list of one session names nothing the header does not already say, so
    the toggle governs the list only once there is more than one — and says so
    on hover rather than sitting there dead with no explanation.
  */
  const listable = sessions.length > 1;
  const showList = listable && listOpen;

  return (
    // Named for the e2e suite: the panel's own box is what maximizing changes,
    // and its header, its list and its panes are all separately-sized children.
    <div data-terminal-panel className="flex h-full min-h-0 flex-col bg-background">
      {/*
        Named for the e2e suite as well: the one thing that must be true of this
        strip is that nothing else in the window is ever drawn on top of it, and
        that is asserted by hit-testing across its width.
      */}
      <div
        data-terminal-header
        className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1 text-xs text-muted-foreground"
      >
        <span>Terminal</span>
        <span className="truncate" title={active?.cwd ?? cwd ?? undefined}>
          {active?.cwd ?? cwd ?? 'no worktree selected'}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
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
            onClick={showNewMenu}
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

      <div className={`flex min-h-0 flex-1 ${side === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
        {showList ? (
          <>
            <TerminalSessionList agents={agents} width={list.current} />
            <ResizeHandle resizable={list} axis="x" label="Resize terminal sessions" />
          </>
        ) : null}

        {/* Positioned, because the stacked panes inside are absolutely placed. */}
        <div className="relative min-h-0 min-w-0 flex-1">
          {sessions.map((session) => (
            <TerminalView
              key={session.id}
              session={session}
              active={session.id === activeId}
              initialInput={pendingInput[session.id] ?? agentInput(agents, session.agentId)}
            />
          ))}

          {sessions.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {cwd ? 'No terminals open. Use + to start one.' : 'No worktree selected.'}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export type TerminalPanelProps = {
  cwd: string | null;
  repoId: string | null;
  repoName: string;
};

/**
 * The agent roster: builtins merged with the user's `agents.json`.
 *
 * Queried rather than imported so an edit to that file shows up on the next
 * launch without a rebuild. The builtins are the placeholder while it loads,
 * and the fallback when there is no bridge at all (jsdom, the e2e harness).
 */
function useAgents(): AgentDefinition[] {
  const { data } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await bridge()?.agent.list())?.agents ?? [...BUILTIN_AGENTS],
    enabled: hasBridge(),
  });
  return data ?? [...BUILTIN_AGENTS];
}

/**
 * What to type into an agent session once its shell is up.
 *
 * A trailing `\r` because this is a keystroke, not an argv: the shell needs the
 * Return to run the line.
 */
function agentInput(agents: AgentDefinition[], agentId?: string): string | undefined {
  if (!agentId) return undefined;
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return undefined;
  return `${[agent.command, ...agent.args].join(' ')}\r`;
}
