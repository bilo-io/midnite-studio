import { type AgentDefinition } from '@midnite/studio-shared';
import { useEffect } from 'react';

import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useRevealSize } from '../../components/use-reveal';
import { useRepos } from '../../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { useMountedSessionIds } from './session-mount-policy';
import { TerminalHeader } from './terminal-header';
import { TerminalSessionList } from './terminal-session-list';
import { inMainPanel, resolveSessionAgentId, useTerminalStore } from './terminal-store';
import { LazyTerminalView } from './lazy-terminal-view';
import { useAgents } from './use-agents';

/**
 * The terminal pane: chrome, the session list, and every session's xterm.
 *
 * Every open session is mounted at once and stacked; only the active one is
 * visible. That is what lets a build keep running in one terminal while you
 * work in another, and it is a deliberate reversal of Phase 9's
 * unmount-when-hidden rule — which existed because a hidden shell had no UI to
 * see or stop it. The session list is that UI.
 */
export function TerminalPanel({ cwd, repoId, repoName, fitSignal }: TerminalPanelProps) {
  // The panel and the session list show main-surface sessions plus Kanban
  // ones (`inMainPanel`) — a FAB loop's session (Phase 35) renders inside the
  // FAB panel and nowhere else, so it stays out.
  const sessions = useTerminalStore((s) => s.sessions).filter(inMainPanel);
  const activeId = useTerminalStore((s) => s.activeId);
  const hydrated = useTerminalStore((s) => s.hydrated);
  const pendingInput = useTerminalStore((s) => s.pendingInput);
  const maximized = useUiStore((s) => s.terminalMaximized);
  const side = useUiStore((s) => s.terminalSidebarSide);
  const listOpen = useUiStore((s) => s.terminalListOpen);
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const keepRecent = useUiStore((s) => s.terminalKeepRecentSessions);
  const disposeAfterMs = useUiStore((s) => s.terminalDisposeAfterMs);

  const { agents, status } = useAgents();
  // For the header's path: which registered checkout the cwd is standing in.
  const { data: repos } = useRepos();

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
   *
   * Counted over the panel's OWN list (`inMainPanel`), which now includes a
   * card's Kanban session — deliberately, and it was worth getting wrong
   * once to see why. Counted over `onMainSurface` instead, on the reading
   * that `Ctrl+`` should always hand you a shell, this fires the moment
   * `revealSession` opens the panel on a card's agent: the new shell is a
   * main-surface session, so `openSession` makes it active, and the reveal
   * lands you on an empty prompt instead of the agent you clicked through
   * to. The panel having content is the condition that matters; `+` is
   * there for a shell alongside it.
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

  const active = sessions.find((s) => s.id === activeId) ?? null;
  /**
   * Which of this panel's OWN sessions still get a live xterm (Phase 84
   * Theme E) — the active one plus a bounded, recently-viewed history,
   * everything else disposed after sitting hidden. Scoped to `active?.id`
   * rather than the raw `activeId`: a FAB-only session can be the store's
   * global active id while this panel shows none of its own as current, and
   * that must read as "nothing visible here", not as an id this policy has
   * never heard of.
   */
  const mountedSessionIdSet = useMountedSessionIds(
    sessions.map((s) => s.id),
    active?.id ?? null,
    { keepRecent, disposeAfterMs, seedUnvisitedAsRecent: true },
  );
  /*
    The header's dot reports the ACTIVE session, so an idle default is the
    honest reading when nothing is open — there is no process to be alive.
  */
  const activeState = useTerminalStore((s) => (activeId ? (s.states[activeId] ?? 'idle') : 'idle'));
  /*
    Where the active shell actually IS, when it has said so (OSC 7, Theme D),
    falling back to where it was opened. The fallback is the whole degradation
    path: macOS `zsh` emits nothing by default, and such a session must read
    exactly as it did before this existed.

    Nothing writes the live value back to the session — `terminals.json` keeps
    the opened-at record, and the session keeps its stored `repoId` even when
    the shell has wandered into another repository entirely.
  */
  const activeLiveCwd = useTerminalStore((s) => (activeId ? s.liveCwd[activeId] : undefined));
  /*
    And what is running in it (Theme E), by the same rule: main's probe wins
    where it has spoken, and the session's stored `agentId` is the fallback for
    one it has not looked at yet. `resolveSessionAgentId` owns that tri-state —
    an absent entry is "never probed", not "nothing running".
  */
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  const activeAgent = active
    ? agents.find((a) => a.id === resolveSessionAgentId(active, liveAgentId))
    : undefined;
  /*
    A list of one session names nothing the header does not already say, so
    the toggle governs the list only once there is more than one — or when a
    legacy session needs the skew banner — and says so on hover rather than
    sitting there dead with no explanation.
  */
  const hasLegacy = sessions.some((s) => (s as { legacy?: boolean }).legacy);
  const listable = sessions.length > 1 || hasLegacy;
  const showList = listable && listOpen;
  /*
    Width-tweened rather than `{showList ? … : null}`: the toggle can flip on
    `sessions.length` crossing 1, not just a click, and either way the rows
    should be clipped as the box shrinks rather than reflow mid-toggle.
  */
  const listTween = useRevealSize<HTMLDivElement>({
    open: showList,
    size: list.current,
    axis: 'x',
    dragging: list.dragging,
  });

  return (
    // Named for the e2e suite: the panel's own box is what maximizing changes,
    // and its header, its list and its panes are all separately-sized children.
    <div data-terminal-panel className="flex h-full min-h-0 flex-col bg-background">
      <TerminalHeader
        path={activeLiveCwd ?? active?.cwd ?? cwd}
        state={activeState}
        agent={activeAgent}
        repos={repos}
        listable={listable}
        showList={showList}
        maximized={maximized}
        agents={agents}
        agentStatus={status}
        hasWorktree={Boolean(cwd)}
        onNewTerminal={() => openNew()}
        onNewAgent={(agent) => openNew(agent)}
      />

      <div className={`flex min-h-0 flex-1 ${side === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
        {listTween.mounted ? (
          <>
            <div
              ref={listTween.ref}
              className="shrink-0 overflow-hidden"
              style={listTween.style}
            >
              <div className="h-full" style={{ width: list.current }}>
                <TerminalSessionList agents={agents} width={list.current} />
              </div>
            </div>
            <ResizeHandle resizable={list} axis="x" label="Resize terminal sessions" />
          </>
        ) : null}

        {/* Positioned, because the stacked panes inside are absolutely placed. */}
        <div className="relative min-h-0 min-w-0 flex-1">
          {sessions.map((session) =>
            mountedSessionIdSet.has(session.id) ? (
              <LazyTerminalView
                key={session.id}
                session={session}
                active={session.id === activeId}
                initialInput={pendingInput[session.id] ?? agentInitialInput(agents, session.agentId)}
                fitSignal={fitSignal}
              />
            ) : (
              /*
                Outside the mounted set (Phase 84 Theme E): no xterm, no
                WebGL slot, nothing for `xterm-budget.ts` to ration — the
                unmount below is what actually frees it. `key` stays the
                session id so React tears the real `LazyTerminalView`
                instance down (running its cleanup: dispose the terminal,
                unsubscribe from `pty:data`, release the budget slot) rather
                than reusing it, the moment this session drops out of the
                mounted set. Reveal remounts a fresh xterm that replays main's
                own scrollback — see `terminal-view.tsx`'s `stateRef.current
                === 'open'` branch, unchanged by this theme: it already
                snapshots and gates live output with no gap or duplicate,
                because a StrictMode remount needed exactly that hand-off
                first.
              */
              <div key={session.id} aria-hidden data-terminal-session-disposed={session.id} />
            ),
          )}

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
  /** Bumped once per settled reveal tween — fits and repaints every open xterm. */
  fitSignal: number;
};

/**
 * What to type into an agent session once its shell is up.
 *
 * A trailing `\r` because this is a keystroke, not an argv: the shell needs the
 * Return to run the line.
 */
export function agentInput(agent: { command: string; args?: readonly string[] | string[] }): string {
  return `${[agent.command, ...(agent.args ?? [])].join(' ')}\r`;
}

export function agentInitialInput(agents: AgentDefinition[], agentId?: string): string | undefined {
  if (!agentId) return undefined;
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return undefined;
  return agentInput(agent);
}
